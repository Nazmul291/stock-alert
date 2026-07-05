import prisma from "../db.server";
import { getMaxProducts } from "./plan-limits";
import { syncState } from "./sync-state.server";
import { classifyProductStatus, countDistinctProducts, paginatedProductIdsByStatus } from "./inventory-rollup.server";
import type { ProductRow, VariantStatusRow } from "../components/ProductEditModal";
import type { InventoryTracking } from "@prisma/client";

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

const STATUS_FILTERS = new Set(["out_of_stock", "low_stock", "in_stock"]);

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

// Assembles a product-level row from its sibling variant tracking rows —
// shared by both branches below so the "all" tab and the status-filter tabs
// always agree on what a product's rolled-up status/quantity looks like.
// imageUrl/imageAlt/shopifyStatus can be overridden with fresher live-Shopify
// data where available (the live-paginated branch has it; the DB-only branch
// doesn't need to call Shopify at all).
function buildTrackedProductRow(
  productId: string,
  rows: InventoryTracking[],
  overrides?: { imageUrl?: string | null; imageAlt?: string | null; shopifyStatus?: string },
): ProductRow {
  const first = rows[0];
  const statuses = rows.map((r) => r.inventoryStatus as string);
  const stockOutDaysValues = rows.map((r) => r.stockOutDays).filter((d): d is number => d != null);

  const variants: VariantStatusRow[] = rows.map((r) => ({
    id: r.id,
    variantId: r.variantId.toString(),
    variantTitle: r.variantTitle,
    sku: r.sku,
    currentQuantity: r.currentQuantity,
    inventoryStatus: r.inventoryStatus as string,
  }));

  return {
    id: first.id,
    productId,
    productTitle: first.productTitle ?? "Unknown",
    sku: rows.length === 1 ? first.sku : null,
    currentQuantity: rows.reduce((sum, r) => sum + r.currentQuantity, 0),
    inventoryStatus: classifyProductStatus(statuses),
    isHidden: first.isHidden,
    isTracked: true,
    monitoringEnabled: first.monitoringEnabled,
    imageUrl: overrides?.imageUrl ?? first.imageUrl,
    imageAlt: overrides?.imageAlt ?? first.imageAlt ?? first.productTitle ?? "Product",
    shopifyStatus: overrides?.shopifyStatus ?? "ACTIVE",
    inventoryItemId: null,
    stockOutDays: stockOutDaysValues.length > 0 ? Math.min(...stockOutDaysValues) : null,
    manualDailySales: first.manualDailySales ?? null,
    expectedRestockDate: first.expectedRestockDate?.toISOString().slice(0, 10) ?? null,
    variants,
    variantCount: rows.length,
    variantsAtRiskCount: statuses.filter((s) => s === "low_stock" || s === "out_of_stock").length,
  };
}

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

  // Status/tracked filters are answered straight from the DB — it holds the
  // status (and now the cached image) for every tracked product regardless of
  // catalog size, whereas the Shopify products() query below only returns one
  // page at a time. Filtering that single page client-side (as this used to
  // do) made the counts depend on which page Shopify happened to return, e.g.
  // showing "0 out of stock" when the true out-of-stock products just weren't
  // on the fetched page. No live Shopify call is needed here at all: the
  // webhook handlers delete a row the moment a product leaves ACTIVE, so any
  // row still present in inventoryTracking is guaranteed to be active, and
  // imageUrl/imageAlt are kept in sync by sync + the product webhooks.
  //
  // Pagination happens on distinct products (via paginatedProductIdsByStatus,
  // which applies the same worst-case-per-product classification used for
  // the dashboard tiles), not on tracking rows — a product with several
  // variants must count once, not once per variant.
  if (STATUS_FILTERS.has(filter) || filter === "tracked") {
    const skip = after ? parseInt(after, 10) : 0;
    const { productIds, total } = await paginatedProductIdsByStatus(shop, filter as any, search, skip, pageSize);

    const [rows, trackedCountDb] = await Promise.all([
      productIds.length > 0
        ? prisma.inventoryTracking.findMany({ where: { shop, productId: { in: productIds } } })
        : Promise.resolve([]),
      countDistinctProducts({ shop, inventoryStatus: { not: "deactivated" } }),
    ]);

    const rowsByProduct = new Map<string, InventoryTracking[]>();
    for (const r of rows) {
      const key = r.productId.toString();
      if (!rowsByProduct.has(key)) rowsByProduct.set(key, []);
      rowsByProduct.get(key)!.push(r);
    }

    const products: ProductRow[] = productIds
      .map((pid) => rowsByProduct.get(pid.toString()))
      .filter((rowsForProduct): rowsForProduct is InventoryTracking[] => !!rowsForProduct && rowsForProduct.length > 0)
      .map((rowsForProduct) => buildTrackedProductRow(rowsForProduct[0].productId.toString(), rowsForProduct));

    const nextSkip = skip + productIds.length;
    return {
      shop, plan, maxProducts, trackedCount: trackedCountDb, threshold, products,
      pageInfo: { hasNextPage: nextSkip < total, endCursor: nextSkip < total ? String(nextSkip) : null },
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

  let shopifyEdges: any[] = [];
  let pageInfo = { hasNextPage: false, endCursor: null as string | null };

  try {
    const shopifyQuery = search ? `status:active AND title:*${search}*` : "status:active";
    const gqlResponse = await admin.graphql(PRODUCTS_GRAPHQL, {
      variables: { first: pageSize, after, query: shopifyQuery },
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
    countDistinctProducts({ shop, inventoryStatus: { not: "deactivated" } }),
  ]);

  const trackingMap = new Map<string, InventoryTracking[]>();
  for (const t of trackingRecords) {
    const key = t.productId.toString();
    if (!trackingMap.has(key)) trackingMap.set(key, []);
    trackingMap.get(key)!.push(t);
  }

  const allProducts = shopifyEdges.map((e: any) => {
    const p = e.node;
    const productId = p.id.split("/").pop() as string;
    const trackingRows = trackingMap.get(productId) ?? [];

    let totalQty = 0;
    const skus: string[] = [];
    let allVariantsUntracked = true;

    for (const ve of p.variants.edges) {
      const v = ve.node;
      if (v.inventoryItem?.tracked !== false) allVariantsUntracked = false;
      totalQty += v.inventoryQuantity ?? 0;
      if (v.sku) skus.push(v.sku);
    }

    const imageUrl: string | null = p.featuredMedia?.preview?.image?.url ?? null;
    const imageAlt: string = p.featuredMedia?.preview?.image?.altText ?? (p.title as string);
    const shopifyStatus: string = p.status;

    if (allVariantsUntracked) {
      return {
        id: trackingRows[0]?.id ?? productId,
        productId,
        productTitle: trackingRows[0]?.productTitle ?? (p.title as string),
        sku: trackingRows[0]?.sku ?? (skus.join(", ") || null),
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

    if (trackingRows.length > 0) {
      return buildTrackedProductRow(productId, trackingRows, { imageUrl, imageAlt, shopifyStatus });
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
      inventoryItemId: null as string | null,
    };
  });

  // Status/tracked filters are handled by the DB-driven branch above and
  // return early — only "not_tracked" and "all" (plus title search) fall
  // through to here, both inherently scoped to whatever page Shopify returns.
  const products = filter === "not_tracked" ? allProducts.filter((p) => !p.isTracked) : allProducts;

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
