/**
 * One-time backfill: populates image_url/image_alt on inventory_tracking rows
 * that predate the image-cache columns, so the Products page filter tabs can
 * read images straight from the DB instead of calling Shopify on every load.
 *
 * Usage:
 *   npm run backfill:product-images
 */

import "dotenv/config";
import prisma from "../app/db.server.js";
import { unauthenticated } from "../app/shopify.server.js";

const NODES_QUERY = `
  query getProductImages($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on Product { featuredMedia { preview { image { url altText } } } }
    }
  }
`;

const CHUNK = 100;

type ProductImageNode = {
  id: string;
  featuredMedia?: { preview: { image: { url: string; altText: string | null } | null } | null } | null;
} | null;
type NodesQueryResponse = { data?: { nodes: ProductImageNode[] } };

async function main() {
  const shops = await prisma.session.findMany({ where: { isOnline: false }, select: { shop: true } });
  let totalUpdated = 0;

  for (const { shop } of shops) {
    const rows = await prisma.inventoryTracking.findMany({
      where: { shop, imageUrl: null },
      select: { productId: true },
    });
    if (rows.length === 0) continue;

    let admin;
    try {
      ({ admin } = await unauthenticated.admin(shop));
    } catch (err) {
      console.warn(`[Backfill] Skipping ${shop} — no valid session:`, err instanceof Error ? err.message : err);
      continue;
    }

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const gids = chunk.map((r) => `gid://shopify/Product/${r.productId}`);

      const res = await admin.graphql(NODES_QUERY, { variables: { ids: gids } });
      const json: NodesQueryResponse = await res.json();
      const nodes = json.data?.nodes ?? [];

      for (let j = 0; j < chunk.length; j++) {
        const node = nodes[j];
        const image = node?.featuredMedia?.preview?.image;
        if (!image?.url) continue;

        await prisma.inventoryTracking.updateMany({
          where: { shop, productId: chunk[j].productId },
          data: { imageUrl: image.url, imageAlt: image.altText ?? null },
        });
        totalUpdated++;
      }
    }
    console.log(`[Backfill] ${shop}: processed ${rows.length} row(s)`);
  }

  console.log(`[Backfill] Updated ${totalUpdated} row(s) across ${shops.length} shop(s).`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("[Backfill] Fatal error:", err);
  process.exit(1);
});
