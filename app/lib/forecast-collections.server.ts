import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

// Resolves which products belong to the collections referenced by a shop's
// collection-scoped forecast rules, and materializes that into
// ForecastCollectionMember.
//
// Why materialize at all: previewPurchaseOrders runs on every dashboard
// render and has no `admin` context, so rule evaluation has to work from
// local state. Why per-rule rather than per-product: Shopify has no reliable
// per-product webhook for automated-collection membership (it changes
// implicitly when tags/price/etc. change), and nesting `collections` under
// the product sync query would multiply the cost of a sync that already
// hand-throttles. This way the API cost scales with the number of distinct
// collections a merchant actually wrote rules against — typically a
// handful — not with catalog size.

const COLLECTION_PRODUCTS_QUERY = `
  query getCollectionProducts($query: String!, $first: Int!, $after: String) {
    products(first: $first, after: $after, query: $query) {
      edges { node { id } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type CollectionProductsResponse = {
  data?: {
    products: {
      edges: Array<{ node: { id: string } }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  errors?: { message: string }[];
};

const MAX_PAGES = 40; // 40 * 250 = 10k products, matching the app's plan ceiling

async function fetchCollectionProductIds(admin: AdminApiContext, collectionId: string): Promise<bigint[]> {
  const ids: bigint[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await admin.graphql(COLLECTION_PRODUCTS_QUERY, {
      // Same search-query form the product sync already uses to scope
      // monitoring to a collection.
      variables: { query: `collection_id:${collectionId}`, first: 250, ...(cursor ? { after: cursor } : {}) },
    });
    const json: CollectionProductsResponse = await res.json();
    const pageData = json.data?.products;
    if (!pageData) break;
    for (const e of pageData.edges) {
      const raw = e.node.id.split("/").pop();
      if (raw) ids.push(BigInt(raw));
    }
    if (!pageData.pageInfo.hasNextPage) break;
    cursor = pageData.pageInfo.endCursor;
  }
  return ids;
}

// Refreshes membership for every distinct collection this shop has an
// enabled collection-scoped rule for. Returns how many collections were
// refreshed. Safe to call when there are none (does nothing, costs nothing).
export async function refreshForecastCollectionMembers(
  shop: string,
  admin: AdminApiContext,
): Promise<{ collections: number; members: number }> {
  const rules = await prisma.forecastRule.findMany({
    where: { shop, enabled: true, scopeType: "collection" },
    select: { scopeValue: true },
  });
  const collectionIds = [...new Set(rules.map((r) => r.scopeValue))];
  if (collectionIds.length === 0) {
    // No collection rules — drop any stale rows left behind by rules that
    // have since been deleted or rescoped.
    await prisma.forecastCollectionMember.deleteMany({ where: { shop } });
    return { collections: 0, members: 0 };
  }

  let totalMembers = 0;
  for (const collectionId of collectionIds) {
    let productIds: bigint[];
    try {
      productIds = await fetchCollectionProductIds(admin, collectionId);
    } catch (err) {
      // Leave the previous membership in place rather than wiping it — a
      // stale rule is far better than one that silently matches nothing.
      console.error(`[ForecastCollections] ${shop} collection ${collectionId} refresh failed:`, err);
      continue;
    }
    // Replace-in-place per collection, in one transaction, so a reader
    // never observes a half-empty membership set for a collection.
    await prisma.$transaction([
      prisma.forecastCollectionMember.deleteMany({ where: { shop, collectionId } }),
      ...(productIds.length > 0
        ? [prisma.forecastCollectionMember.createMany({
            data: productIds.map((productId) => ({ shop, collectionId, productId })),
            skipDuplicates: true,
          })]
        : []),
    ]);
    totalMembers += productIds.length;
  }

  // Collections no longer referenced by any rule.
  await prisma.forecastCollectionMember.deleteMany({
    where: { shop, collectionId: { notIn: collectionIds } },
  });

  return { collections: collectionIds.length, members: totalMembers };
}
