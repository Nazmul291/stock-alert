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
} from "../app/lib/notifications.js";
import {
  QUEUE_NAME,
  type BufferPayload,
  type InventoryBufferJobData,
} from "../app/lib/queue.js";

// ── pg-boss instance ──────────────────────────────────────────────────────────
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL! });

boss.on("error", (err) => {
  console.error("[Worker] pg-boss fatal error:", err.message);
  // Exit so Fly.io restarts the worker automatically rather than silently stalling.
  process.exit(1);
});

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
