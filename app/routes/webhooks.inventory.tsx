import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getBoss,
  INVENTORY_EVENT_QUEUE_NAME,
  WEBHOOK_DEDUP_SECONDS,
  JOB_RETRY_LIMIT,
  JOB_RETRY_DELAY,
} from "../lib/queue";
import { syncState } from "../lib/sync-state.server";
import { shouldSkipInventoryEvent } from "../lib/inventory-item-map.server";

// Verify, one indexed read, enqueue. That's the whole route.
//
// It used to resolve the variant against the Shopify Admin API, classify it,
// write inventory_tracking and fan out every alert channel — all inside a
// promise fired *after* the 200 was returned, so a VM restart mid-flight
// silently dropped the event. All of that now lives in the worker behind a
// durable pg-boss job (app/lib/inventory-event.server.ts).
//
// Shopify's payload only carries inventory_item_id, and inventory_tracking is
// keyed by (shop, variantId) with no inventoryItemId column — which is why the
// old route had to call the Admin API before it could even tell whether the
// variant was tracked. inventory_item_map exists to answer that from one
// indexed row instead.

type InventoryLevelsUpdatePayload = {
  inventory_item_id?: number | string;
  location_id?: number | string;
  available?: number;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "INVENTORY_LEVELS_UPDATE") {
    return new Response(null, { status: 200 });
  }

  const data = payload as InventoryLevelsUpdatePayload;
  const inventoryItemId = data?.inventory_item_id?.toString();
  if (!inventoryItemId) return new Response(null, { status: 200 });

  const locationId = data.location_id != null ? String(data.location_id) : null;

  // Track webhook health non-blocking
  syncState.webhookReceived(shop).catch(() => {});

  // ── Guard: skip work we already know is pointless, with zero Admin API calls ──
  // See shouldSkipInventoryEvent for why this fails open on a miss.
  const mapped = await prisma.inventoryItemMap.findUnique({
    where: { inventoryItemId: BigInt(inventoryItemId) },
  });
  if (shouldSkipInventoryEvent(mapped, shop)) {
    return new Response(null, { status: 200 });
  }

  // ── Durable enqueue ────────────────────────────────────────────────────────
  // singletonKey/singletonSeconds replaces the module-scope Map this route used
  // to dedup with: pg-boss collapses repeat deliveries for the same
  // (shop, item, location) inside the window in Postgres, so it stays correct
  // however many web instances are running.
  try {
    const boss = await getBoss();
    await boss.send(
      INVENTORY_EVENT_QUEUE_NAME,
      { shop, inventoryItemId, locationId },
      {
        singletonKey: `${shop}_${inventoryItemId}_${locationId ?? 0}`,
        singletonSeconds: WEBHOOK_DEDUP_SECONDS,
        retryLimit: JOB_RETRY_LIMIT,
        retryDelay: JOB_RETRY_DELAY,
        retryBackoff: true,
      },
    );
  } catch (err) {
    // Never 500 back to Shopify — a non-200 makes Shopify retry the delivery,
    // and repeated failures get the webhook subscription removed entirely.
    console.error("[Webhook] Failed to enqueue inventory event:", err);
  }

  return new Response(null, { status: 200 });
};
