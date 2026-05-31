import { Queue } from "bullmq";
import IORedis from "ioredis";

// How long (ms) to wait for silence before firing one notification.
export const DEBOUNCE_MS = 10_000;

// ── Shared payload type ──────────────────────────────────────────────────────
// Stored in InventoryBuffer.payload so the worker has everything it needs
// without making any additional Shopify API or DB calls.

export interface StoreCtx {
  shop: string;
  plan: string | null;
  email: string | null;
}

export interface SettingsCtx {
  emailNotifications: boolean;
  slackNotifications: boolean;
  notificationEmail: string | null;
  slackWebhookUrl: string | null;
}

export interface ProductCtx {
  id: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
}

export interface BufferPayload {
  alertType: "low_stock" | "out_of_stock";
  newQty: number;
  threshold: number;
  storeCtx: StoreCtx;
  settingsCtx: SettingsCtx;
  productCtx: ProductCtx;
}

// ── BullMQ job data ──────────────────────────────────────────────────────────

export interface InventoryBufferJobData {
  eventKey: string; // "{productId}_{shop}_{alertType}"
}

// ── Queue singleton (lazy — created on first use, server-side only) ──────────

let _connection: IORedis | null = null;
let _queue: Queue<InventoryBufferJobData> | null = null;

function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return _connection;
}

export function getInventoryBufferQueue(): Queue<InventoryBufferJobData> {
  if (!_queue) {
    _queue = new Queue<InventoryBufferJobData>("inventory-buffer", {
      connection: getConnection(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });
  }
  return _queue;
}
