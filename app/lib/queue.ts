import { PgBoss } from "pg-boss";

export const QUEUE_NAME = "inventory-buffer";
export const DIGEST_QUEUE_NAME = "digest-daily";
export const DEBOUNCE_SECONDS = 10;
export const JOB_RETRY_LIMIT = 3;
export const JOB_RETRY_DELAY = 60;

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
      // pg-boss v12 requires explicit queue creation before send/work
      await boss.createQueue(QUEUE_NAME);
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
