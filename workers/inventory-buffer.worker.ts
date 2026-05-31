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

import "dotenv/config";
import { PgBoss, type Job } from "pg-boss";
import prisma from "../app/db.server.js";
import {
  sendLowStockAlert,
  sendOutOfStockAlert,
} from "../app/lib/notifications.js";
import {
  QUEUE_NAME,
  DEBOUNCE_SECONDS,
  type BufferPayload,
  type InventoryBufferJobData,
} from "../app/lib/queue.js";

// ── pg-boss instance ──────────────────────────────────────────────────────────
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });

boss.on("error", (err) =>
  console.error("[Worker] pg-boss error:", err.message),
);

await boss.start();
await boss.createQueue(QUEUE_NAME); // pg-boss v12: queue must exist before work()
console.log("[Worker] pg-boss started. Listening on queue:", QUEUE_NAME);

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

async function processJob(job: Job<InventoryBufferJobData>): Promise<void> {
  const { eventKey } = job.data;
  console.log(`[Worker] Processing job ${job.id} — key: ${eventKey}`);

  // ── 1. Fetch the buffer row ───────────────────────────────────────────────
  const buffer = await prisma.inventoryBuffer.findUnique({
    where: { eventKey },
  });

  if (!buffer) {
    console.log(`[Worker] Buffer row not found for ${eventKey} — already processed.`);
    return;
  }

  // ── 2. Stale-check ────────────────────────────────────────────────────────
  // If another webhook arrived after this job was scheduled it reset updatedAt
  // and enqueued its own job. This job exits; the newer job fires the alert.
  const staleCutoff = new Date(Date.now() - DEBOUNCE_SECONDS * 1000);

  if (buffer.updatedAt > staleCutoff) {
    const msSince = Date.now() - buffer.updatedAt.getTime();
    console.log(
      `[Worker] Buffer ${eventKey} updated ${msSince}ms ago — within debounce window. Skipping.`,
    );
    return;
  }

  // ── 3. Atomically claim the buffer row ───────────────────────────────────
  // Multiple concurrent workers may pass the stale-check simultaneously.
  // Only the one that actually deletes the row (count > 0) fires the alert.
  const { count } = await prisma.inventoryBuffer.deleteMany({
    where: { eventKey, updatedAt: { lte: staleCutoff } },
  });

  if (count === 0) {
    console.log(`[Worker] Buffer ${eventKey} already claimed by another worker — skipping.`);
    return;
  }

  // ── 4. Fire the notification ──────────────────────────────────────────────
  const payload = buffer.payload as unknown as BufferPayload;
  console.log(`[Worker] Quiet window elapsed — firing ${payload.alertType} alert for ${eventKey}.`);

  if (payload.alertType === "out_of_stock") {
    await sendOutOfStockAlert(payload.storeCtx, payload.productCtx, payload.settingsCtx);
  } else {
    await sendLowStockAlert(
      payload.storeCtx,
      payload.productCtx,
      payload.newQty,
      payload.threshold,
      payload.settingsCtx,
    );
  }

  console.log(`[Worker] Alert sent and buffer cleared for ${eventKey}.`);
}

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
  clearInterval(heartbeatInterval);
  await boss.stop({ graceful: true });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
