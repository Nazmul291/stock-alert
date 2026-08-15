import type { Plan } from "@prisma/client";
import prisma from "../db.server";

// Keeps inventory_item_map in step with inventory_tracking.
//
// The map exists so the inventory webhook can answer "which variant is this,
// and does this shop still care about it?" from one indexed read instead of a
// Shopify Admin API round trip (Shopify's payload only carries
// inventory_item_id, and inventory_tracking has no such column).
//
// monitoringEnabled and plan are denormalized copies, so every write that
// changes either on the source of truth must come back through here or the map
// goes stale and starts gating alerts on out-of-date information. Every
// mutation below is a single statement (or one chunked transaction), never a
// per-row loop, so even a plan change on a 20k-variant shop is cheap.
//
// A missing row is never treated as "untracked" by the webhook — see its
// fail-open guard — so a brief gap while a new product is being mapped costs an
// extra Admin call in the worker, not a dropped alert.

// Ids arrive as strings from GraphQL and as numbers from REST webhook payloads;
// BigInt() takes either, so accept both rather than making each call site cast.
type ShopifyId = string | number | bigint;

export type InventoryItemMapEntry = {
  inventoryItemId: ShopifyId;
  productId: ShopifyId;
  variantId: ShopifyId;
  monitoringEnabled?: boolean;
};

const CHUNK = 100;

// Callers hold `plan` as a loose string (session.plan, a form value, a default
// of "basic"), so normalize here rather than making every call site cast into
// the Prisma enum. An unrecognized value becomes null, which the webhook guard
// reads as "no active plan" — the same conservative answer it would give for a
// shop whose subscription lapsed.
function toPlan(plan: string | null | undefined): Plan | null {
  return plan === "basic" || plan === "pro" || plan === "enterprise" ? plan : null;
}

/**
 * Upserts map rows for variants whose inventoryItemId we've just learned.
 * Entries missing an inventoryItemId are skipped rather than throwing — not
 * every Shopify payload carries one, and a missing map row degrades to an
 * extra Admin call in the worker rather than a lost alert.
 */
export async function syncInventoryItemMap(
  shop: string,
  plan: string | null | undefined,
  entries: InventoryItemMapEntry[],
): Promise<void> {
  const usable = entries.filter((e) => e.inventoryItemId != null && String(e.inventoryItemId).length > 0);
  if (usable.length === 0) return;

  const normalizedPlan = toPlan(plan);
  for (let i = 0; i < usable.length; i += CHUNK) {
    const chunk = usable.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((e) => {
        const inventoryItemId = BigInt(e.inventoryItemId);
        const data = {
          shop,
          productId: BigInt(e.productId),
          variantId: BigInt(e.variantId),
          plan: normalizedPlan,
          ...(e.monitoringEnabled !== undefined ? { monitoringEnabled: e.monitoringEnabled } : {}),
        };
        return prisma.inventoryItemMap.upsert({
          where: { inventoryItemId },
          update: data,
          create: { inventoryItemId, ...data },
        });
      }),
    );
  }
}

/** Mirrors a monitoringEnabled change. Scope to products, variants, or the whole shop. */
export async function setInventoryItemMapMonitoring(
  shop: string,
  scope: { productIds?: ShopifyId[]; variantIds?: ShopifyId[] },
  monitoringEnabled: boolean,
): Promise<void> {
  const where: { shop: string; productId?: { in: bigint[] }; variantId?: { in: bigint[] } } = { shop };
  if (scope.productIds) where.productId = { in: scope.productIds.map((id) => BigInt(id)) };
  if (scope.variantIds) where.variantId = { in: scope.variantIds.map((id) => BigInt(id)) };
  await prisma.inventoryItemMap.updateMany({ where, data: { monitoringEnabled } });
}

/**
 * Mirrors a plan change across every mapped item for the shop — one statement,
 * so an upgrade/downgrade on a large catalogue is a single bulk UPDATE rather
 * than thousands of writes.
 */
export async function setInventoryItemMapPlan(shop: string, plan: string | null | undefined): Promise<void> {
  await prisma.inventoryItemMap.updateMany({ where: { shop }, data: { plan: toPlan(plan) } });
}

/**
 * The inventory webhook's guard, as a pure predicate so it can be exercised
 * directly (a route file can't export helpers — React Router only strips
 * loader/action/headers exports, so anything else would be pulled into the
 * client bundle along with db.server).
 *
 * Fails OPEN by design: only a positive "we know this item and this shop has
 * stopped caring about it" answer drops the event. A missing row means the item
 * simply hasn't been mapped yet (product created moments ago, shop mid-backfill)
 * and must still be enqueued, or alerting would silently die for every unmapped
 * variant — the kind of failure nobody notices until a merchant complains.
 */
export function shouldSkipInventoryEvent(
  mapped: { shop: string; monitoringEnabled: boolean; plan: Plan | null } | null,
  shop: string,
): boolean {
  if (!mapped) return false;              // unmapped — let the worker decide
  if (mapped.shop !== shop) return false; // stale/foreign row — let the worker decide
  return !mapped.monitoringEnabled || !mapped.plan;
}

/** Drops map rows when a product stops being tracked (untracked, or deleted in Shopify). */
export async function deleteInventoryItemMapForProducts(
  shop: string,
  productIds: ShopifyId[],
): Promise<void> {
  if (productIds.length === 0) return;
  await prisma.inventoryItemMap.deleteMany({
    where: { shop, productId: { in: productIds.map((id) => BigInt(id)) } },
  });
}
