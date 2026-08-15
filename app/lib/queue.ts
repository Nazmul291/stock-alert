import { PgBoss } from "pg-boss";

export const QUEUE_NAME = "inventory-buffer";
export const INVENTORY_EVENT_QUEUE_NAME = "inventory-event";
export const DIGEST_QUEUE_NAME = "digest-daily";
export const VELOCITY_QUEUE_NAME = "velocity-daily";
export const ALERT_BATCH_QUEUE_NAME = "alert-batch-daily";
export const DEBOUNCE_SECONDS = 10;
export const JOB_RETRY_LIMIT = 3;
export const JOB_RETRY_DELAY = 60;
// Window in which repeat inventory_levels/update events for the same
// (shop, item, location) collapse into one job. Replaces the module-scope
// requestCache Map the webhook used to dedup with — that only worked per-VM,
// so it silently stopped deduping once web ran on more than one machine.
// pg-boss applies this in Postgres via singletonKey, so it stays correct
// however many web instances are running.
export const WEBHOOK_DEDUP_SECONDS = 3;

// ── Shared payload type ──────────────────────────────────────────────────────

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
  brandLogoUrl?: string | null;
  brandColor?: string | null;
  brandSenderName?: string | null;
  whatsappNotifications?: boolean;
  whatsappPhone?: string | null;
  whatsappPhoneVerified?: boolean;
  asanaEnabled?: boolean;
  asanaAccessToken?: string | null;
  asanaWorkspaceGid?: string | null;
  alertDeliveryMode?: string;
  lowStockMuted?: boolean;
  outOfStockMuted?: boolean;
  restockMuted?: boolean;
}

export interface ProductCtx {
  id: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  variantId: string;
  variantTitle: string | null;
}

export interface BufferPayload {
  alertType: "low_stock" | "out_of_stock";
  newQty: number;
  threshold: number;
  storeCtx: StoreCtx;
  settingsCtx: SettingsCtx;
  productCtx: ProductCtx;
}

export interface InventoryBufferJobData {
  eventKey: string;
}

// What the inventory webhook now enqueues instead of doing the work itself.
// Deliberately tiny — just enough to identify the event. The worker resolves
// the variant, re-reads settings and classifies, so nothing here can go stale
// between enqueue and processing (unlike BufferPayload above, which freezes a
// whole settings snapshot into the row).
export interface InventoryEventJobData {
  shop: string;
  inventoryItemId: string;
  locationId: string | null;
}

// ── pg-boss singleton (producer side — web process) ──────────────────────────
// The worker process creates its own separate instance.

let _boss: PgBoss | null = null;
let _initPromise: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (_boss) return _boss;

  // Prevent multiple concurrent init calls from racing
  if (!_initPromise) {
    _initPromise = (async () => {
      const boss = new PgBoss(process.env.DATABASE_URL!);
      await boss.start();
      // pg-boss v12 requires explicit queue creation before send/work.
      // The web process only ever *sends* to inventory-event (the webhook);
      // the worker is what consumes it.
      await boss.createQueue(QUEUE_NAME);
      await boss.createQueue(INVENTORY_EVENT_QUEUE_NAME);
      _boss = boss;
      return boss;
    })().catch((err) => {
      // Clear so the next call retries rather than returning the same rejected promise
      _initPromise = null;
      throw err;
    });
  }

  return _initPromise;
}
