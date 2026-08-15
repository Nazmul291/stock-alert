/**
 * Inventory Buffer Worker (pg-boss — no Redis required)
 *
 * Uses the same PostgreSQL database as the rest of the app.
 * pg-boss manages job scheduling, locking, and retries inside Postgres.
 *
 * Run alongside the web server:
 *   npm run dev:worker        (development, auto-reloads)
 *   npm run start:worker      (production)
 */

// Identifies this process to db.server.ts so it skips web-only tasks (admin seed).
process.env.PROCESS_TYPE = "worker";

import "dotenv/config";
import { PgBoss, type Job } from "pg-boss";
import prisma from "../app/db.server.js";
import {
  sendLowStockAlert,
  sendOutOfStockAlert,
  sendDigestEmail,
  sendAlertBatchEmail,
  sendAlertBatchSlack,
} from "../app/lib/notifications.js";
import {
  QUEUE_NAME,
  INVENTORY_EVENT_QUEUE_NAME,
  DIGEST_QUEUE_NAME,
  VELOCITY_QUEUE_NAME,
  ALERT_BATCH_QUEUE_NAME,
  type BufferPayload,
  type InventoryBufferJobData,
  type InventoryEventJobData,
} from "../app/lib/queue.js";
import type { AlertBatchEmailData, AlertBatchEvent } from "../app/lib/email-templates.js";
import type { AlertType } from "@prisma/client";
import { atRiskRepresentativeRows } from "../app/lib/inventory-rollup.server.js";
import { refreshShopVelocity } from "../app/lib/velocity.server.js";
import { processInventoryEvent } from "../app/lib/inventory-event.server.js";
import { unauthenticated } from "../app/shopify.server.js";

// ── pg-boss instance ──────────────────────────────────────────────────────────
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });

boss.on("error", (err) => {
  console.error("[Worker] pg-boss fatal error:", err.message);
  // Exit so Fly.io restarts the worker automatically rather than silently stalling.
  process.exit(1);
});

await boss.start();
await boss.createQueue(QUEUE_NAME);
await boss.createQueue(INVENTORY_EVENT_QUEUE_NAME);
await boss.createQueue(DIGEST_QUEUE_NAME);
await boss.createQueue(VELOCITY_QUEUE_NAME);
await boss.createQueue(ALERT_BATCH_QUEUE_NAME);
console.log("[Worker] pg-boss started. Listening on queues:", QUEUE_NAME, INVENTORY_EVENT_QUEUE_NAME, DIGEST_QUEUE_NAME, VELOCITY_QUEUE_NAME, ALERT_BATCH_QUEUE_NAME);

// ── Job handler ───────────────────────────────────────────────────────────────
// pg-boss v12 WorkHandler always receives Job<T>[] — an array.
// batchSize defaults to 1 so each call normally has exactly one job.
await boss.work<InventoryBufferJobData>(
  QUEUE_NAME,
  { localConcurrency: 5 }, // up to 5 handlers run in parallel on this node
  async (jobs: Job<InventoryBufferJobData>[]) => {
    for (const job of jobs) {
      await processJob(job);
    }
  },
);

// ── Inventory event handler ───────────────────────────────────────────────────
// The webhook now only verifies, guards on inventory_item_map and enqueues here;
// resolving the variant, classifying it, writing inventory_tracking and routing
// into the debounce buffer all happen in this process. Because the job is
// durable, a restart mid-flight retries the event rather than losing it — the
// old fire-and-forget promise after the webhook's 200 had no such guarantee.
await boss.work<InventoryEventJobData>(
  INVENTORY_EVENT_QUEUE_NAME,
  { localConcurrency: 5 },
  async (jobs: Job<InventoryEventJobData>[]) => {
    for (const job of jobs) {
      console.log(`[Worker] Processing inventory event ${job.id} — ${job.data.shop} item ${job.data.inventoryItemId}`);
      await processInventoryEvent(job.data);
    }
  },
);

async function processJob(job: Job<InventoryBufferJobData>): Promise<void> {
  const { eventKey } = job.data;
  console.log(`[Worker] Processing job ${job.id} — key: ${eventKey}`);

  // ── 1. Fetch the buffer row ───────────────────────────────────────────────
  const buffer = await prisma.inventoryBuffer.findUnique({ where: { eventKey } });

  if (!buffer) {
    console.log(`[Worker] Buffer row not found for ${eventKey} — already processed.`);
    return;
  }

  // ── 2. Fire the notification BEFORE deleting the buffer row ──────────────
  // If the send throws (e.g. SMTP down), pg-boss marks the job failed and
  // retries it. Because we haven't deleted the row yet, the retry will find
  // it and re-attempt the send.  Deleting first (the old order) meant a send
  // failure permanently lost the alert.
  const payload = buffer.payload as unknown as BufferPayload;
  console.log(`[Worker] Quiet window elapsed — firing ${payload.alertType} for ${eventKey}.`);

  if (payload.alertType === "out_of_stock") {
    await sendOutOfStockAlert(payload.storeCtx, payload.productCtx, payload.settingsCtx, payload.productCtx.variantTitle);
  } else {
    await sendLowStockAlert(
      payload.storeCtx,
      payload.productCtx,
      payload.newQty,
      payload.threshold,
      payload.settingsCtx,
      payload.productCtx.variantTitle,
    );
  }

  // ── 3. Claim the row using the exact updatedAt we read ───────────────────
  // If a new webhook arrived during the send and bumped updatedAt with a
  // fresher payload, this deleteMany matches 0 rows — leaving the new row
  // intact for its own scheduled job. No double-delete, no lost follow-up alert.
  const { count } = await prisma.inventoryBuffer.deleteMany({
    where: { eventKey, updatedAt: buffer.updatedAt },
  });

  if (count === 0) {
    console.log(`[Worker] Buffer ${eventKey} was superseded during send — leaving new row for next job.`);
  } else {
    console.log(`[Worker] Alert sent and buffer cleared for ${eventKey}.`);
  }
}

// ── Digest cron ──────────────────────────────────────────────────────────────
// Fires every hour, on the hour. Each shop picks its own send time via
// digestTimezone (default UTC) — the handler checks, per shop, whether it's
// currently 8am in *that* zone before sending, instead of every shop getting
// the digest at a single fixed UTC hour regardless of where they are.
await boss.schedule(DIGEST_QUEUE_NAME, "0 * * * *", {});
console.log("[Worker] Digest cron scheduled — fires hourly, sends at each shop's local 8:00 AM");

await boss.work<Record<string, never>>(DIGEST_QUEUE_NAME, async () => {
  await processDigests();
});

// ── Velocity cron ─────────────────────────────────────────────────────────────
// Fires once per day at 5am UTC, before the 8am digest so it reflects
// freshly-refreshed stockOutDays. Pro/Enterprise only — recalculating avg
// daily sales requires an Orders API query per shop, so Basic shops (the
// large majority of installs) are skipped entirely rather than adding load
// for a plan that isn't gated on this data anyway.
await boss.schedule(VELOCITY_QUEUE_NAME, "0 5 * * *", {});
console.log("[Worker] Velocity cron scheduled — fires daily at 05:00 UTC (Pro/Enterprise only)");

await boss.work<Record<string, never>>(VELOCITY_QUEUE_NAME, async () => {
  await processVelocityRefresh();
});

// ── Alert batch cron ───────────────────────────────────────────────────────────
// Fires once per day at 23:55 UTC (end of day) — flushes the day's
// Email/Slack-pending alert events for shops on alertDeliveryMode "daily".
// Only ever touches Email and Slack: in-app history, WhatsApp, Klaviyo,
// Asana, and Flow already fired instantly regardless of this setting (see
// sendLowStockAlert et al.).
await boss.schedule(ALERT_BATCH_QUEUE_NAME, "55 23 * * *", {});
console.log("[Worker] Alert batch cron scheduled — fires daily at 23:55 UTC");

await boss.work<Record<string, never>>(ALERT_BATCH_QUEUE_NAME, async () => {
  await processAlertBatches();
});

async function processVelocityRefresh(): Promise<void> {
  const now = new Date();
  console.log(`[Velocity] Running daily refresh — ${now.toUTCString()}`);

  const shops = await prisma.session.findMany({
    where: { isOnline: false, plan: { in: ["pro", "enterprise"] } },
    select: { shop: true },
  });

  console.log(`[Velocity] ${shops.length} Pro/Enterprise shop(s) eligible`);

  for (const { shop } of shops) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const { updatedProducts } = await refreshShopVelocity(shop, admin);
      console.log(`[Velocity] ${shop}: refreshed ${updatedProducts} product(s)`);
    } catch (err) {
      console.error(`[Velocity] Failed for ${shop}:`, err instanceof Error ? err.message : err);
    }
  }
}

// Local hour (0-23) and whether it's currently Monday, both evaluated in
// `timeZone` rather than the server's UTC clock — this is what lets each
// shop's digest land at 8am *their* time despite the cron firing hourly on a
// single shared schedule. Falls back to UTC if `timeZone` is somehow invalid
// (shouldn't happen — digestTimezone is validated against DIGEST_TIMEZONES
// when saved in app.settings.tsx) rather than throwing and skipping the shop.
function localHourAndIsMonday(date: Date, timeZone: string): { hour: number; isMonday: boolean } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hour: "numeric", hourCycle: "h23", weekday: "short",
    }).formatToParts(date);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const isMonday = parts.find((p) => p.type === "weekday")?.value === "Mon";
    return { hour, isMonday };
  } catch {
    return { hour: date.getUTCHours(), isMonday: date.getUTCDay() === 1 };
  }
}

async function processDigests(): Promise<void> {
  const now = new Date();

  console.log(`[Digest] Running check — ${now.toUTCString()}`);

  const shops = await prisma.storeSettings.findMany({
    where: {
      digestEnabled: true,
      emailNotifications: true,
      notificationEmail: { not: null },
    },
    include: { session: { select: { plan: true } } },
  });

  console.log(`[Digest] ${shops.length} shop(s) eligible`);

  for (const settings of shops) {
    const shop = settings.shop;
    const plan = settings.session?.plan ?? "basic";
    const isDaily = plan === "pro" && settings.digestFrequency === "daily";

    const { hour, isMonday } = localHourAndIsMonday(now, settings.digestTimezone);
    if (hour !== 8) continue; // not yet 8am in this shop's own timezone
    if (!isDaily && !isMonday) continue;

    // Skip if already sent in the last 20 hours (prevents double-fire on restart)
    if (settings.lastDigestSentAt) {
      const hoursSince = (now.getTime() - settings.lastDigestSentAt.getTime()) / 3_600_000;
      if (hoursSince < 20) {
        console.log(`[Digest] Skipping ${shop} — sent ${hoursSince.toFixed(1)}h ago`);
        continue;
      }
    }

    // One representative row per at-risk product (its worst variant) — a
    // product with several bad variants shouldn't appear multiple times.
    const atRisk = await atRiskRepresentativeRows(shop, 20, true);

    if (atRisk.length === 0) {
      console.log(`[Digest] ${shop} — nothing at risk, skipping`);
      continue;
    }

    const recipients = settings.notificationEmail!.split(",").map((e) => e.trim()).filter(Boolean);
    const frequency = isDaily ? "Daily" : "Weekly";

    await sendDigestEmail(shop, recipients, {
      shop,
      frequency,
      outOfStock: atRisk.filter((p) => p.inventoryStatus === "out_of_stock"),
      lowStock: atRisk.filter((p) => p.inventoryStatus === "low_stock"),
    }, {
      logoUrl: settings.brandLogoUrl,
      color: settings.brandColor,
      senderName: settings.brandSenderName,
    });

    await prisma.storeSettings.update({
      where: { shop },
      data: { lastDigestSentAt: now },
    });

    console.log(`[Digest] ${frequency} digest → [${recipients.join(", ")}] for ${shop} — ${atRisk.length} products`);
  }
}

// Sources from AlertHistory (written unconditionally by logAlert whenever
// Email or Slack is configured at all — see sendLowStockAlert's comment)
// rather than a separate accumulation table: every deferred/instant event
// already has a row there, so this just picks up what hasn't been delivered
// yet. sentToEmail is the recipient address (or null if never sent);
// sentToSlack is a plain boolean — both null/false is exactly "logged but
// still owed a delivery."
async function processAlertBatches(): Promise<void> {
  const now = new Date();
  console.log(`[AlertBatch] Running check — ${now.toUTCString()}`);

  const shops = await prisma.storeSettings.findMany({
    where: {
      alertDeliveryMode: "daily",
      OR: [
        { emailNotifications: true },
        { slackNotifications: true, slackWebhookUrl: { not: null } },
      ],
    },
  });

  console.log(`[AlertBatch] ${shops.length} shop(s) on daily delivery`);

  for (const settings of shops) {
    const shop = settings.shop;

    // Skip if already flushed in the last 20 hours (restart-safety guard,
    // same pattern as processDigests above).
    if (settings.lastAlertBatchSentAt) {
      const hoursSince = (now.getTime() - settings.lastAlertBatchSentAt.getTime()) / 3_600_000;
      if (hoursSince < 20) {
        console.log(`[AlertBatch] Skipping ${shop} — sent ${hoursSince.toFixed(1)}h ago`);
        continue;
      }
    }

    const events = await prisma.alertHistory.findMany({
      where: {
        shop,
        sentAt: { gt: settings.lastAlertBatchSentAt ?? new Date(0) },
        sentToEmail: null,
        sentToSlack: false,
      },
      orderBy: { sentAt: "asc" },
    });

    // Re-checked here (flush time), not when each event originally fired —
    // an unmute between the event and tonight's flush is honored.
    const mutedTypes = new Set<AlertType>([
      ...(settings.lowStockMuted ? (["low_stock"] as const) : []),
      ...(settings.outOfStockMuted ? (["out_of_stock"] as const) : []),
      ...(settings.restockMuted ? (["restock"] as const) : []),
    ]);
    const eligible = events.filter((e) => e.alertType && !mutedTypes.has(e.alertType));

    if (eligible.length === 0) {
      console.log(`[AlertBatch] ${shop} — nothing to report, skipping`);
      continue;
    }

    const toEvent = (e: (typeof eligible)[number]): AlertBatchEvent => ({
      productTitle: e.productTitle,
      variantTitle: e.variantTitle,
      sku: null, // AlertHistory doesn't store SKU — only shown on instant alerts
      quantityAtAlert: e.quantityAtAlert,
    });

    const data: AlertBatchEmailData = {
      shop,
      outOfStock: eligible.filter((e) => e.alertType === "out_of_stock").map(toEvent),
      lowStock: eligible.filter((e) => e.alertType === "low_stock").map(toEvent),
      restock: eligible.filter((e) => e.alertType === "restock").map(toEvent),
    };

    if (settings.emailNotifications && settings.notificationEmail) {
      const recipients = settings.notificationEmail.split(",").map((e) => e.trim()).filter(Boolean);
      await sendAlertBatchEmail(shop, recipients, data, {
        logoUrl: settings.brandLogoUrl,
        color: settings.brandColor,
        senderName: settings.brandSenderName,
      });
    }

    if (settings.slackNotifications && settings.slackWebhookUrl) {
      await sendAlertBatchSlack(settings.slackWebhookUrl, data, shop.replace(".myshopify.com", ""));
    }

    await prisma.storeSettings.update({
      where: { shop },
      data: { lastAlertBatchSentAt: now },
    });

    console.log(`[AlertBatch] Sent for ${shop} — ${eligible.length} event(s)`);
  }
}

// ── Stale buffer cleanup ──────────────────────────────────────────────────────
// If a job exhausts all retries (send permanently fails), the buffer row is
// never deleted by the handler. Clean up rows older than 30 minutes to prevent
// orphaned accumulation. 30 min >> max retry window (60 + 120 + 240 = 7 min).
const bufferCleanupInterval = setInterval(async () => {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const { count } = await prisma.inventoryBuffer.deleteMany({
      where: { updatedAt: { lt: cutoff } },
    });
    if (count > 0) {
      console.log(`[Worker] Cleaned up ${count} stale buffer row(s) older than 30 minutes`);
    }
  } catch (err) {
    console.error("[Worker] Buffer cleanup failed:", (err as Error).message);
  }
}, 15 * 60 * 1000); // every 15 minutes

// ── Supabase heartbeat ────────────────────────────────────────────────────────
// Supabase free tier pauses after inactivity; a periodic query keeps it alive.
const heartbeatInterval = setInterval(async () => {
  try {
    await prisma.$executeRaw`SELECT 1`;
    console.log("[Worker] Heartbeat OK");
  } catch (err) {
    console.error("[Worker] Heartbeat failed:", (err as Error).message);
  }
}, 5 * 60 * 1000); // every 5 minutes

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  console.log("[Worker] Shutting down...");
  clearInterval(bufferCleanupInterval);
  clearInterval(heartbeatInterval);
  await boss.stop({ graceful: true });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
