import { redis } from "./redis.server";
import type { InventoryDelta } from "../stores/products-store";

// Fire-and-forget push notification that some shop's data changed. Consumed by
// api.live-stream.ts's shared subscriber and fanned out to that shop's open
// SSE connections. A no-op wherever REDIS_URL isn't set — matches the rest of
// this codebase's optional-Redis pattern (shop-cache.server.ts, sse-token.server.ts).
//
// `delta`, when present, lets the client patch a single row in place (see
// use-live-events.ts + products-store.ts's applyInventoryDelta) instead of
// refetching the whole "products" topic — used by webhooks.inventory.tsx,
// which already knows exactly which variant changed and to what. Other
// publish sites (product create/delete, alerts, sync) don't have a single-
// row delta to offer and just pass topics, which still trigger a full
// refetch as before.
export async function publishEvent(shop: string, topics: string[], delta?: InventoryDelta): Promise<void> {
  if (!redis) return;
  try {
    await redis.publish(`events:${shop}`, JSON.stringify({ topics, ts: Date.now(), delta }));
  } catch (err) {
    console.error("[broadcast] publish failed:", err instanceof Error ? err.message : err);
  }
}
