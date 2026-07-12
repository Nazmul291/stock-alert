/**
 * One-time cleanup: removes tracking rows for products that are no longer
 * ACTIVE in Shopify (archived/draft/deleted), left over from before the
 * PRODUCTS_UPDATE webhook started deleting them itself.
 *
 * Usage:
 *   npm run cleanup:archived-products            # dry run, logs what would be deleted
 *   npm run cleanup:archived-products -- --apply  # actually deletes
 */

import "dotenv/config";
import prisma from "../app/db.server.js";
import { unauthenticated } from "../app/shopify.server.js";

const NODES_QUERY = `
  query getProductStatuses($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on Product { status }
    }
  }
`;

const apply = process.argv.includes("--apply");
const CHUNK = 100;

type ProductStatusNode = { id: string; status: string } | null;
type NodesQueryResponse = { data?: { nodes: ProductStatusNode[] } };

async function main() {
  const shops = await prisma.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
  });

  let totalDeleted = 0;

  for (const { shop } of shops) {
    const rows = await prisma.inventoryTracking.findMany({
      where: { shop },
      select: { productId: true, productTitle: true },
    });
    if (rows.length === 0) continue;

    let admin;
    try {
      ({ admin } = await unauthenticated.admin(shop));
    } catch (err) {
      console.warn(`[Cleanup] Skipping ${shop} — no valid session:`, err instanceof Error ? err.message : err);
      continue;
    }

    const staleIds: bigint[] = [];

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const gids = chunk.map((r) => `gid://shopify/Product/${r.productId}`);

      const res = await admin.graphql(NODES_QUERY, { variables: { ids: gids } });
      const json: NodesQueryResponse = await res.json();
      const nodes = json.data?.nodes ?? [];

      for (let j = 0; j < chunk.length; j++) {
        const node = nodes[j];
        // A null node means the product was deleted from Shopify entirely.
        const status = node?.status;
        if (!node || status !== "ACTIVE") {
          staleIds.push(chunk[j].productId);
          console.log(`[Cleanup] ${shop}: "${chunk[j].productTitle ?? chunk[j].productId}" is ${status ?? "DELETED"} — ${apply ? "deleting" : "would delete"}`);
        }
      }
    }

    if (staleIds.length > 0 && apply) {
      await prisma.inventoryTracking.deleteMany({
        where: { shop, productId: { in: staleIds } },
      });
    }

    totalDeleted += staleIds.length;
  }

  console.log(`[Cleanup] ${apply ? "Deleted" : "Would delete"} ${totalDeleted} stale row(s) across ${shops.length} shop(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[Cleanup] Fatal error:", err);
  process.exit(1);
});
