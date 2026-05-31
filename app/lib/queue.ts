import PgBoss from "pg-boss";

export const QUEUE_NAME = "inventory-buffer";
export const DEBOUNCE_SECONDS = 10;

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
      const boss = new PgBoss({
        connectionString: process.env.DATABASE_URL!,
        // Keep the producer lightweight — no polling, no scheduling overhead
        noScheduling: true,
      });
      await boss.start();
      _boss = boss;
      return boss;
    })();
  }

  return _initPromise;
}
