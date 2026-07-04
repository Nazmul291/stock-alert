import prisma from "../db.server";
import { getMaxProducts } from "./plan-limits";
import { syncState } from "./sync-state.server";
import type { ProductRow } from "../components/ProductEditModal";

const PRODUCTS_GRAPHQL = `
  query getProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id title status
          featuredMedia { preview { image { url altText } } }
          variants(first: 100) {
            edges {
              node {
                sku inventoryQuantity
                inventoryItem { id tracked }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export type ProductsData = {
  shop: string;
  plan: string;
  maxProducts: number;
  trackedCount: number;
  threshold: number;
  products: ProductRow[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  syncRunning: boolean;
  lastSyncCompletedAt: string | null;
  lastSyncCount: number | null;
  autoHideEnabled: boolean;
  autoRepublishEnabled: boolean;
  supplierLeadTimeDays: number;
  monitoringFilter: string;
  monitoringCollectionId: string | null;
  monitoringTags: string | null;
};

export async function loadProductsData({ admin, shop, search, after, filter }: {
  admin: any; shop: string; search: string; after: string | null; filter: string;
}): Promise<ProductsData> {
  const pageSize = 50;

  const [storeSession, settings, shopSyncState] = await Promise.all([
    prisma.session.findFirst({ where: { shop, isOnline: false } }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    syncState.get(shop),
  ]);

  const plan = storeSession?.plan ?? "basic";
  const maxProducts = getMaxProducts(plan);
  const threshold = settings?.lowStockThreshold ?? 5;

  let shopifyEdges: any[] = [];
  let pageInfo = { hasNextPage: false, endCursor: null as string | null };

  try {
    const shopifyQuery = search ? `title:*${search}*` : null;
    const gqlResponse = await admin.graphql(PRODUCTS_GRAPHQL, {
      variables: { first: pageSize, after, ...(shopifyQuery ? { query: shopifyQuery } : {}) },
    });
    const gqlJson: any = await gqlResponse.json();
    const productsData = gqlJson.data?.products;
    if (productsData) {
      shopifyEdges = productsData.edges;
      pageInfo = { hasNextPage: productsData.pageInfo.hasNextPage, endCursor: productsData.pageInfo.endCursor };
    }
  } catch {
    // Fall back gracefully
  }

  const productIds = shopifyEdges.map((e: any) => BigInt(e.node.id.split("/").pop()));
  const [trackingRecords, trackedCount] = await Promise.all([
    productIds.length > 0
      ? prisma.inventoryTracking.findMany({ where: { shop, productId: { in: productIds } } })
      : Promise.resolve([]),
    prisma.inventoryTracking.count({ where: { shop, inventoryStatus: { not: "deactivated" } } }),
  ]);

  const trackingMap = new Map(trackingRecords.map((t) => [t.productId.toString(), t]));

  const allProducts = shopifyEdges.map((e: any) => {
    const p = e.node;
    const productId = p.id.split("/").pop() as string;
    const tracking = trackingMap.get(productId);

    let totalQty = 0;
    const skus: string[] = [];
    let allVariantsUntracked = true;
    let firstInventoryItemId: string | null = null;

    for (const ve of p.variants.edges) {
      const v = ve.node;
      const isTracked = v.inventoryItem?.tracked !== false;
      if (isTracked) {
        allVariantsUntracked = false;
        if (!firstInventoryItemId) firstInventoryItemId = v.inventoryItem?.id ?? null;
      }
      totalQty += v.inventoryQuantity ?? 0;
      if (v.sku) skus.push(v.sku);
    }

    const imageUrl: string | null = p.featuredMedia?.preview?.image?.url ?? null;
    const imageAlt: string = p.featuredMedia?.preview?.image?.altText ?? (p.title as string);
    const shopifyStatus: string = p.status;

    if (allVariantsUntracked) {
      return {
        id: tracking?.id ?? productId,
        productId,
        productTitle: tracking?.productTitle ?? (p.title as string),
        sku: tracking?.sku ?? (skus.join(", ") || null),
        currentQuantity: 0,
        inventoryStatus: "not_tracked" as string,
        isHidden: false,
        isTracked: false,
        monitoringEnabled: false,
        imageUrl,
        imageAlt,
        shopifyStatus,
        inventoryItemId: null as string | null,
      };
    }

    if (tracking) {
      return {
        id: tracking.id,
        productId,
        productTitle: tracking.productTitle ?? p.title,
        sku: tracking.sku,
        currentQuantity: tracking.currentQuantity,
        inventoryStatus: tracking.inventoryStatus as string,
        isHidden: tracking.isHidden,
        isTracked: true,
        monitoringEnabled: tracking.monitoringEnabled,
        imageUrl,
        imageAlt,
        shopifyStatus,
        inventoryItemId: firstInventoryItemId,
        stockOutDays: tracking.stockOutDays ?? null,
        manualDailySales: tracking.manualDailySales ?? null,
        expectedRestockDate: tracking.expectedRestockDate?.toISOString().slice(0, 10) ?? null,
      };
    }

    return {
      id: productId,
      productId,
      productTitle: p.title as string,
      sku: skus.join(", ") || null,
      currentQuantity: totalQty,
      inventoryStatus: "not_tracked" as string,
      isHidden: false,
      isTracked: false,
      monitoringEnabled: false,
      imageUrl,
      imageAlt,
      shopifyStatus,
      inventoryItemId: firstInventoryItemId,
    };
  });

  const products =
    filter === "out_of_stock"  ? allProducts.filter((p) => p.inventoryStatus === "out_of_stock")
    : filter === "low_stock"   ? allProducts.filter((p) => p.inventoryStatus === "low_stock")
    : filter === "in_stock"    ? allProducts.filter((p) => p.inventoryStatus === "in_stock")
    : filter === "tracked"     ? allProducts.filter((p) => p.isTracked)
    : filter === "not_tracked" ? allProducts.filter((p) => !p.isTracked)
    : allProducts;

  return {
    shop, plan, maxProducts, trackedCount, threshold, products: products as ProductRow[], pageInfo,
    syncRunning: shopSyncState?.running ?? false,
    lastSyncCompletedAt: shopSyncState?.completedAt?.toISOString() ?? null,
    lastSyncCount: shopSyncState?.syncedCount ?? null,
    autoHideEnabled: settings?.autoHideEnabled ?? false,
    autoRepublishEnabled: settings?.autoRepublishEnabled ?? false,
    supplierLeadTimeDays: settings?.supplierLeadTimeDays ?? 7,
    monitoringFilter: settings?.monitoringFilter ?? "all",
    monitoringCollectionId: settings?.monitoringCollectionId ?? null,
    monitoringTags: settings?.monitoringTags ?? null,
  };
}
