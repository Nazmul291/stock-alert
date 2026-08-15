/**
 * One-time backfill: populates inventory_item_map for shops that were tracking
 * products before the map existed.
 *
 * The inventory webhook uses this table to resolve Shopify's inventory_item_id
 * to a variant without an Admin API call. Its guard fails OPEN on a miss, so an
 * un-backfilled shop still gets alerts — it just pays for an Admin round trip
 * per event until this runs. That makes the backfill a performance fix, not a
 * correctness prerequisite, and safe to run at any time.
 *
 * Resolves ids from live Shopify rather than existing-data/inventory_item_mapping_rows.csv:
 * that CSV is from an older incarnation of the app, keyed by a store_id UUID
 * instead of the shop domain, and carries no monitoring/plan columns.
 *
 * Idempotent — re-running only refreshes rows.
 *
 * Usage:
 *   npm run backfill:inventory-item-map
 */

import "dotenv/config";
import prisma from "../app/db.server.js";
import { unauthenticated } from "../app/shopify.server.js";
import { syncInventoryItemMap } from "../app/lib/inventory-item-map.server.js";

const NODES_QUERY = `
  query getVariantInventoryItems($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on ProductVariant {
        inventoryItem { id }
      }
    }
  }
`;

const CHUNK = 100;

type VariantNode = { id: string; inventoryItem?: { id: string } | null } | null;
type NodesQueryResponse = { data?: { nodes: VariantNode[] } };

async function main() {
  const shops = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true, plan: true },
  });
  let totalMapped = 0;

  for (const { shop, plan } of shops) {
    const rows = await prisma.inventoryTracking.findMany({
      where: { shop },
      select: { productId: true, variantId: true, monitoringEnabled: true },
    });
    if (rows.length === 0) continue;

    let admin;
    try {
      ({ admin } = await unauthenticated.admin(shop));
    } catch (err) {
      console.warn(`[Backfill] Skipping ${shop} — no valid session:`, err instanceof Error ? err.message : err);
      continue;
    }

    let mappedForShop = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const gids = chunk.map((r) => `gid://shopify/ProductVariant/${r.variantId.toString()}`);

      let nodes: VariantNode[] = [];
      try {
        const res = await admin.graphql(NODES_QUERY, { variables: { ids: gids } });
        const json: NodesQueryResponse = await res.json();
        nodes = json.data?.nodes ?? [];
      } catch (err) {
        console.warn(`[Backfill] ${shop} chunk ${i}–${i + chunk.length} failed:`, err instanceof Error ? err.message : err);
        continue;
      }

      // nodes(ids:) preserves request order, and returns null for ids the shop
      // can no longer see (variant deleted since it was tracked) — those are
      // simply skipped rather than treated as an error.
      const entries = chunk.flatMap((r, j) => {
        const inventoryItemGid = nodes[j]?.inventoryItem?.id;
        if (!inventoryItemGid) return [];
        return [{
          inventoryItemId: inventoryItemGid.split("/").pop() as string,
          productId: r.productId,
          variantId: r.variantId,
          monitoringEnabled: r.monitoringEnabled,
        }];
      });

      await syncInventoryItemMap(shop, plan, entries);
      mappedForShop += entries.length;
    }

    totalMapped += mappedForShop;
    console.log(`[Backfill] ${shop}: mapped ${mappedForShop}/${rows.length} tracked variants`);
  }

  console.log(`[Backfill] Done — ${totalMapped} inventory item(s) mapped across ${shops.length} shop(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[Backfill] Failed:", err);
    process.exit(1);
  });
