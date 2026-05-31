/**
 * Inventory Buffer Worker
 *
 * Run alongside the main web server:
 *   npm run dev:worker        (development, auto-reloads)
 *   npm run start:worker      (production)
 *
 * Each job wakes up after DEBOUNCE_MS and checks whether the InventoryBuffer
 * row's updatedAt is still older than DEBOUNCE_MS.  If yes → the product had
 * no further inventory updates during the window → fire the notification.
 * If no → a newer webhook already reset the timer → this job exits silently
 * and the job spawned by that later webhook will do the check next.
 */

import "dotenv/config"; // loads .env when NODE_OPTIONS=--env-file isn't used
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import prisma from "../app/db.server.js";
import {
  sendLowStockAlert,
  sendOutOfStockAlert,
} from "../app/lib/notifications.js";
import {
  DEBOUNCE_MS,
  type BufferPayload,
  type InventoryBufferJobData,
} from "../app/lib/queue.js";

// ── Redis connection ──────────────────────────────────────────────────────────
// The worker owns its own connection — separate from the queue producer.
const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
  {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  },
);

// ── Job processor ─────────────────────────────────────────────────────────────
async function processJob(job: Job<InventoryBufferJobData>): Promise<void> {
  const { eventKey } = job.data;
  console.log(`[Worker] Processing job ${job.id} for key: ${eventKey}`);

  // ── 1. Fetch the buffer row ───────────────────────────────────────────────
  const buffer = await prisma.inventoryBuffer.findUnique({
    where: { eventKey },
  });

  if (!buffer) {
    // Already processed and deleted by a concurrent job — nothing to do.
    console.log(
      `[Worker] Buffer row not found for ${eventKey} — already processed.`,
    );
    return;
  }

  // ── 2. Stale-check: has the row been updated within the debounce window? ──
  // If another webhook arrived after this job was scheduled, it would have
  // upserted the row (resetting updatedAt) and enqueued its own delayed job.
  // In that case THIS job should exit — the newer job will do the work.
  const staleCutoff = new Date(Date.now() - DEBOUNCE_MS);

  if (buffer.updatedAt > staleCutoff) {
    const msSinceUpdate = Date.now() - buffer.updatedAt.getTime();
    console.log(
      `[Worker] Buffer ${eventKey} was updated ${msSinceUpdate}ms ago — still within debounce window. ` +
        `Skipping; the job from the more recent webhook will fire.`,
    );
    return;
  }

  // ── 3. Fire the notification ──────────────────────────────────────────────
  // sendLowStockAlert / sendOutOfStockAlert each internally call logAlert()
  // which writes to alertHistory — keeping the 10-minute cooldown accurate.
  const payload = buffer.payload as unknown as BufferPayload;

  console.log(
    `[Worker] Buffer ${eventKey} is ${Math.round((Date.now() - buffer.updatedAt.getTime()) / 1000)}s old — quiet window elapsed. Firing ${payload.alertType} alert.`,
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

  // ── 4. Delete the buffer row ──────────────────────────────────────────────
  // Use deleteMany to avoid a crash if a concurrent worker already deleted it.
  await prisma.inventoryBuffer.deleteMany({ where: { eventKey } });
  console.log(
    `[Worker] Alert sent and buffer row deleted for key: ${eventKey}`,
  );
}

// ── Worker instance ───────────────────────────────────────────────────────────
const worker = new Worker<InventoryBufferJobData>(
  "inventory-buffer",
  processJob,
  {
    connection,
    concurrency: 5, // Process up to 5 jobs simultaneously
    removeOnComplete: { count: 0 }, // Don't keep completed job records
    removeOnFail: { count: 100 }, // Keep last 100 failed jobs for inspection
  },
);

worker.on("completed", (job) =>
  console.log(
    `[Worker] Job ${job.id} (${job.data.eventKey}) completed successfully.`,
  ),
);

worker.on("failed", (job, err) =>
  console.error(
    `[Worker] Job ${job?.id} (${job?.data?.eventKey}) failed:`,
    err.message,
  ),
);

worker.on("error", (err) =>
  console.error("[Worker] Worker-level error:", err.message),
);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[Worker] SIGTERM received — draining and closing worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[Worker] SIGINT received — draining and closing worker...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

console.log(
  `[Worker] inventory-buffer worker started. Redis: ${process.env.REDIS_URL ?? "redis://127.0.0.1:6379"}`,
);
