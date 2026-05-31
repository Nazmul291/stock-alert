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
import PgBoss from "pg-boss";
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

// ── pg-boss instance (worker owns its own connection) ────────────────────────
const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL!,
});

boss.on("error", (err) =>
  console.error("[Worker] pg-boss error:", err.message),
);

await boss.start();
console.log("[Worker] pg-boss started. Listening on queue:", QUEUE_NAME);

// ── Job handler ───────────────────────────────────────────────────────────────
await boss.work<InventoryBufferJobData>(
  QUEUE_NAME,
  { teamSize: 5, teamConcurrency: 5 },
  async (job) => {
    const { eventKey } = job.data;
    console.log(`[Worker] Processing job ${job.id} — key: ${eventKey}`);

    // ── 1. Fetch the buffer row ─────────────────────────────────────────────
    const buffer = await prisma.inventoryBuffer.findUnique({
      where: { eventKey },
    });

    if (!buffer) {
      console.log(
        `[Worker] Buffer row not found for ${eventKey} — already processed.`,
      );
      return;
    }

    // ── 2. Stale-check ──────────────────────────────────────────────────────
    // If another webhook arrived after this job was scheduled, it reset
    // updatedAt and enqueued its own job. This job should exit; that newer
    // job will handle it when ITS debounce window expires.
    const staleCutoff = new Date(Date.now() - DEBOUNCE_SECONDS * 1000);

    if (buffer.updatedAt > staleCutoff) {
      const msSince = Date.now() - buffer.updatedAt.getTime();
      console.log(
        `[Worker] Buffer ${eventKey} updated ${msSince}ms ago — within debounce window. Skipping.`,
      );
      return;
    }

    // ── 3. Fire the notification ────────────────────────────────────────────
    // sendLowStockAlert / sendOutOfStockAlert each call logAlert() internally,
    // which writes to alertHistory and keeps the 10-min cooldown accurate.
    const payload = buffer.payload as unknown as BufferPayload;

    console.log(
      `[Worker] Quiet window elapsed for ${eventKey} — firing ${payload.alertType} alert.`,
    );

    if (payload.alertType === "out_of_stock") {
      await sendOutOfStockAlert(
        payload.storeCtx,
        payload.productCtx,
        payload.settingsCtx,
      );
    } else {
      await sendLowStockAlert(
        payload.storeCtx,
        payload.productCtx,
        payload.newQty,
        payload.threshold,
        payload.settingsCtx,
      );
    }

    // ── 4. Delete the buffer row ────────────────────────────────────────────
    // deleteMany is safe if a concurrent worker already deleted it.
    await prisma.inventoryBuffer.deleteMany({ where: { eventKey } });
    console.log(`[Worker] Alert sent and buffer cleared for ${eventKey}.`);
  },
);

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown() {
  console.log("[Worker] Shutting down...");
  await boss.stop({ graceful: true });
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
