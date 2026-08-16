import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, useNavigation, useSubmit, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { useSSECacheStore } from "../hooks/use-sse-cache-store";
import { useSSEData } from "../hooks/use-sse-data";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMaxProducts, canUseFeature, formatMaxProducts, getPlanLimits } from "../lib/plan-limits";
import { enforcePlanLimits } from "../lib/plan-enforcement";
import { syncState } from "../lib/sync-state.server";
import { refreshShopVelocity } from "../lib/velocity.server";
import { publishEvent } from "../lib/broadcast.server";
import { syncInventoryItemMap, setInventoryItemMapMonitoring } from "../lib/inventory-item-map.server";
import { SSEErrorRetry } from "../components/Skeleton";
import { ProductSyncButton } from "../components/products/ProductSyncButton";
import { ProductsToolbar } from "../components/products/ProductsToolbar";
import { ProductsTable } from "../components/products/ProductsTable";
import { ProductsBulkActionBar } from "../components/products/ProductsBulkActionBar";
import { ProductsPagination } from "../components/products/ProductsPagination";
import { CreatePurchaseOrderModal } from "../components/purchase-orders/CreatePurchaseOrderModal";
import type { ProductsData } from "../lib/products-data.server";
import { useProductsStore, type ProductsStore } from "../stores/products-store";
import type { InventoryStatus } from "@prisma/client";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
};

type CollectionsResponse = GraphQLResponse<{
  collections: {
    edges: Array<{ node: { id: string; title: string; legacyResourceId: string } }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}>;

type SyncProductVariantEdge = {
  node: {
    id: string; title: string; sku: string | null; inventoryQuantity: number | null;
    inventoryItem: { id: string; tracked: boolean } | null;
  };
};
type SyncProductEdge = {
  node: {
    id: string; title: string; status: string; tags: string[]; vendor: string | null;
    featuredMedia: { preview: { image: { url: string; altText: string | null } | null } | null } | null;
    customThreshold: { value: string } | null;
    variants: { edges: SyncProductVariantEdge[] };
  };
};
type SyncProductsResponse = GraphQLResponse<{
  products: { edges: SyncProductEdge[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}>;

type SyncVariantRow = {
  productId: bigint; variantId: bigint; productTitle: string; variantTitle: string | null;
  sku: string | null; currentQuantity: number; inventoryStatus: "in_stock" | "low_stock" | "out_of_stock";
  imageUrl: string | null; imageAlt: string | null; tags: string | null; vendor: string | null;
  // Feeds inventory_item_map alongside the inventory_tracking upsert below.
  // Nullable because a variant with inventory tracking switched off in Shopify
  // has no inventoryItem to map.
  inventoryItemId: bigint | null;
};

const SYNC_PRODUCTS_GRAPHQL = `
  query getProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id title status tags vendor
          featuredMedia { preview { image { url altText } } }
          customThreshold: metafield(namespace: "stock_alert", key: "custom_threshold") { value }
          variants(first: 100) {
            edges {
              node {
                id title sku inventoryQuantity
                # inventoryItem.id feeds inventory_item_map, which is what lets
                # the inventory webhook resolve an event without an Admin call.
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

const COLLECTIONS_GRAPHQL = `
  query getCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      edges { node { id title legacyResourceId } }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  // The intents below are resource-route-style sub-requests (CSV export, the
  // collection picker, the edit modal's inventory/settings fetchers) — they're
  // not the main page render, so they stay fully synchronous/awaited exactly
  // as before.
  if (url.searchParams.get("intent") === "export_csv") {
    const csvFilter = url.searchParams.get("filter") ?? "all";
    const statusFilter: InventoryStatus[] =
      csvFilter === "out_of_stock" ? ["out_of_stock"]
      : csvFilter === "low_stock"  ? ["low_stock"]
      : csvFilter === "in_stock"   ? ["in_stock"]
      : ["in_stock", "low_stock", "out_of_stock"];

    // One row per variant — the SKU-level detail (which variant, its own
    // quantity) is what makes this actionable for reordering; a rolled-up
    // per-product row would lose exactly that.
    const rows = await prisma.inventoryTracking.findMany({
      where: { shop, inventoryStatus: { in: statusFilter }, monitoringEnabled: true },
      orderBy: [{ inventoryStatus: "asc" }, { currentQuantity: "asc" }],
      select: {
        productId: true, productTitle: true, variantTitle: true, sku: true,
        currentQuantity: true, inventoryStatus: true,
        stockOutDays: true, avgDailySales: true,
        lastAlertType: true, lastAlertSentAt: true,
      },
    });

    const header = ["Product Title", "Variant", "SKU", "Quantity", "Status", "Days Left", "Avg Daily Sales", "Last Alert", "Last Alert Date"];
    const escape = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      header.join(","),
      ...rows.map((r) => [
        escape(r.productTitle),
        escape(r.variantTitle),
        escape(r.sku),
        r.currentQuantity,
        r.inventoryStatus,
        r.stockOutDays ?? "",
        r.avgDailySales != null ? r.avgDailySales.toFixed(2) : "",
        r.lastAlertType ?? "",
        r.lastAlertSentAt ? r.lastAlertSentAt.toISOString().slice(0, 10) : "",
      ].join(",")),
    ];

    const csvContent = lines.join("\r\n");
    const csvFilename = `stock-alert-${csvFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    return { csvContent, csvFilename };
  }

  if (url.searchParams.get("intent") === "get_collections") {
    const collections: { id: string; title: string }[] = [];
    let cursor: string | null = null;
    let hasNext = true;
    while (hasNext && collections.length < 250) {
      const res = await admin.graphql(COLLECTIONS_GRAPHQL, { variables: { first: 50, ...(cursor ? { after: cursor } : {}) } });
      const json: CollectionsResponse = await res.json();
      const page = json.data?.collections;
      if (!page) break;
      for (const e of page.edges) collections.push({ id: e.node.legacyResourceId, title: e.node.title });
      hasNext = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;
    }
    return { collections };
  }

  const search = url.searchParams.get("search") ?? "";
  const after = url.searchParams.get("after") ?? null;
  const prev = url.searchParams.get("prev") ?? "";
  const filter = url.searchParams.get("filter") ?? "all";

  // This is the actual page render — the Shopify product fetch + DB lookups
  // run in the background via api.products-stream.ts and stream back to the
  // client once ready, instead of blocking this document response on them.
  return { search, filter, after, prev };
};


async function runProductSync({ admin, shop, plan, maxProducts, threshold, monitoringFilter, monitoringCollectionId, monitoringTags }: {
  admin: AdminClient; shop: string; plan: string; maxProducts: number; threshold: number;
  monitoringFilter?: string; monitoringCollectionId?: string | null; monitoringTags?: string | null;
}) {
  const allVariants: SyncVariantRow[] = [];
  const seenProductIds = new Set<string>();
  let cursor: string | null = null;
  let hasNextPage = true;
  let pageCount = 0;

  try {
    while (hasNextPage && seenProductIds.size < maxProducts) {
      const batchSize = Math.min(250, maxProducts - seenProductIds.size);
      const filterQuery =
        monitoringFilter === "collection" && monitoringCollectionId
          ? `collection_id:${monitoringCollectionId}`
          : monitoringFilter === "tags" && monitoringTags
          ? monitoringTags.split(",").map((t) => `tag:${t.trim()}`).join(" OR ")
          : null;
      const syncQuery = filterQuery ? `status:active AND (${filterQuery})` : "status:active";
      const gqlResponse = await admin.graphql(SYNC_PRODUCTS_GRAPHQL, {
        variables: { first: batchSize, after: cursor, query: syncQuery },
      });
      const gqlJson: SyncProductsResponse = await gqlResponse.json();

      const throttle = gqlJson.extensions?.cost?.throttleStatus;
      if (throttle && throttle.currentlyAvailable < throttle.restoreRate * 1.5) {
        const needed = throttle.restoreRate * 1.5 - throttle.currentlyAvailable;
        const waitMs = Math.ceil((needed / throttle.restoreRate) * 1000);
        await new Promise((r) => setTimeout(r, waitMs));
      }

      const page = gqlJson.data?.products;
      if (!page) break;

      for (const edge of page.edges) {
        const p = edge.node;
        const productId = p.id.split("/").pop() as string;
        seenProductIds.add(productId);
        const imageUrl = p.featuredMedia?.preview?.image?.url ?? null;
        const imageAlt = p.featuredMedia?.preview?.image?.altText ?? null;
        // Comma-joined, consistent with StoreSettings.monitoringTags — used
        // by the Enterprise "Core vs. Limited-Edition" report split.
        const tags = p.tags && p.tags.length > 0 ? p.tags.join(",") : null;
        // Mirrored locally so vendor-scoped forecast rules can be resolved
        // without a Shopify round trip (see forecast-mode.ts).
        const vendor = p.vendor?.trim() || null;

        // Per-product custom thresholds are a Pro feature; ignore the metafield for basic stores.
        const productThreshold =
          canUseFeature(plan, "perProductThresholds") && p.customThreshold?.value ? parseInt(p.customThreshold.value) : threshold;

        for (const ve of p.variants.edges) {
          const v = ve.node;
          // Skip untracked variants individually rather than skipping the
          // whole product — a product can have some tracked and some
          // untracked variants.
          if (v.inventoryItem?.tracked === false) continue;

          const qty = v.inventoryQuantity ?? 0;
          const status: "in_stock" | "low_stock" | "out_of_stock" =
            qty <= 0 ? "out_of_stock" : qty <= productThreshold ? "low_stock" : "in_stock";

          allVariants.push({
            productId: BigInt(productId),
            variantId: BigInt(v.id.split("/").pop() as string),
            productTitle: p.title,
            variantTitle: v.title,
            sku: v.sku || null,
            currentQuantity: qty,
            inventoryStatus: status,
            imageUrl,
            imageAlt,
            tags,
            vendor,
            inventoryItemId: v.inventoryItem?.id
              ? BigInt(v.inventoryItem.id.split("/").pop() as string)
              : null,
          });
        }
      }

      hasNextPage = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;
      pageCount += 1;

      // An unlimited plan (maxProducts: Infinity) has no known total to
      // measure progress against — seenProductIds.size / Infinity is always
      // 0, which would freeze the bar at 5% for the whole fetch. Fall back
      // to a page-count heuristic that keeps inching toward 80% instead.
      const fetchPct = Number.isFinite(maxProducts)
        ? Math.min(80, 5 + Math.round((seenProductIds.size / maxProducts) * 75))
        : Math.min(80, Math.round(80 - 75 / (pageCount + 1)));
      await syncState.progress(shop, fetchPct);
    }

    await syncState.progress(shop, 82);
    const CHUNK = 100;
    const now = new Date();
    for (let i = 0; i < allVariants.length; i += CHUNK) {
      const chunk = allVariants.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((v) =>
          prisma.inventoryTracking.upsert({
            where: { shop_variantId: { shop, variantId: v.variantId } },
            update: { productTitle: v.productTitle, variantTitle: v.variantTitle, sku: v.sku, currentQuantity: v.currentQuantity, inventoryStatus: v.inventoryStatus, imageUrl: v.imageUrl, imageAlt: v.imageAlt, tags: v.tags, vendor: v.vendor, lastCheckedAt: now },
            create: { shop, productId: v.productId, variantId: v.variantId, productTitle: v.productTitle, variantTitle: v.variantTitle, sku: v.sku, currentQuantity: v.currentQuantity, previousQuantity: v.currentQuantity, inventoryStatus: v.inventoryStatus, imageUrl: v.imageUrl, imageAlt: v.imageAlt, tags: v.tags, vendor: v.vendor },
          }),
        ),
      );
      const dbPct = 82 + Math.round(((i + chunk.length) / allVariants.length) * 16);
      await syncState.progress(shop, dbPct);
    }

    // Mirror into inventory_item_map so the inventory webhook can resolve
    // these variants without an Admin API call. Best-effort: a failure here
    // only costs the webhook its fast path (it falls open to the worker), so
    // it must never fail the sync itself.
    await syncInventoryItemMap(
      shop,
      plan,
      allVariants
        .filter((v) => v.inventoryItemId !== null)
        .map((v) => ({
          inventoryItemId: v.inventoryItemId!,
          productId: v.productId,
          variantId: v.variantId,
        })),
    ).catch((err) => console.error("[Sync] inventory_item_map sync failed:", err));

    if (allVariants.length > 0) {
      const syncedVariantIds = allVariants.map((v) => v.variantId);
      // Scoped to products that had at least one tracked variant survive
      // into this batch — NOT "every product the search query returned."
      // Two independent lag sources can make a product look wrongly empty
      // in a single sync pass: products(query: "status:active") is backed by
      // Shopify's search index (can lag behind real-time changes), and even
      // once a product IS returned, its variants' inventoryItem.tracked flag
      // has its own consistency window and can transiently read back false
      // for every variant right after heavy edits. Scoping to productIds
      // that actually produced a tracked variant this pass means a product
      // hit by either glitch simply keeps its existing rows untouched rather
      // than losing them; a real single-variant removal within an otherwise
      // fine product is still pruned correctly.
      const productsWithVariantsBigInt = [...new Set(allVariants.map((v) => v.productId.toString()))].map(BigInt);
      const { count: pruned } = await prisma.inventoryTracking.deleteMany({
        where: { shop, productId: { in: productsWithVariantsBigInt }, variantId: { notIn: syncedVariantIds } },
      });
      if (pruned > 0) {
        console.log(`[Sync] Pruned ${pruned} stale variant row(s) for ${shop}`);
      }
    }

    await prisma.setupProgress.upsert({
      where: { shop },
      update: { firstProductTracked: true, productThresholdsConfigured: true },
      create: { shop, appInstalled: true, firstProductTracked: true, productThresholdsConfigured: true, globalSettingsConfigured: false, notificationsConfigured: false },
    });

    const enforcement = await enforcePlanLimits(shop, plan);
    if (enforcement.deactivatedCount > 0) {
      console.log(`[Sync] Plan limit enforced for ${shop}: deactivated ${enforcement.deactivatedCount} products (max ${enforcement.maxAllowed})`);
    }

    // Everything the UI actually waits on is done — signal completion now
    // rather than after velocity too, which used to hold the progress bar at
    // 99% for however long a 30-day order lookup takes on top of an
    // already-finished sync. Velocity runs as its own detached background
    // step below; refreshVelocityInBackground publishes its own live event
    // when it lands, so the dashboard picks up the refined numbers without
    // the merchant having to wait on them to see their sync finish.
    await syncState.done(shop, seenProductIds.size);

    refreshVelocityInBackground(shop, admin);
  } catch (err) {
    await syncState.fail(shop, err instanceof Error ? err.message : "Unknown error");
  }
}

// Query last 30 days of orders to compute avg daily sales. avgDailySales/
// stockOutDays stay product-wide (velocity.server.ts only resolves orders
// down to the product level, not variant), so each variant's stockOutDays is
// "this variant's own quantity against the product's blended sales rate" — a
// reasonable approximation until per-variant velocity is added. Same shared
// function the daily velocity cron uses (see workers/inventory-buffer.worker.ts)
// — a manual sync just gets an on-demand refresh instead of waiting for the
// next cron run. Deliberately not awaited by its caller — see the comment
// above runProductSync's syncState.done() call.
async function refreshVelocityInBackground(shop: string, admin: AdminClient) {
  try {
    const { updatedProducts } = await refreshShopVelocity(shop, admin);
    console.log(`[Sync] Velocity updated for ${updatedProducts} product(s) in ${shop}`);
    await publishEvent(shop, ["products", "dashboard", "analytics"]);
  } catch (err) {
    console.warn(`[Sync] Velocity calc failed for ${shop}:`, err instanceof Error ? err.message : err);
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "bulk_monitoring") {
    const productIds = JSON.parse((form.get("productIds") as string) ?? "[]") as string[];
    const enabled = form.get("monitoringEnabled") === "true";
    let updatedCount = productIds.length;
    if (productIds.length > 0) {
      const ids = productIds.map(BigInt);
      if (enabled) {
        // Recompute each row's real stock status since it was overwritten
        // with 'deactivated' while off (see the single-product save above).
        // Rows benched by plan-limit enforcement ('requires_upgrade') are
        // skipped — bulk-enabling can't be used to bypass the plan's
        // product cap without upgrading.
        const settings = await prisma.storeSettings.findUnique({ where: { shop } });
        const threshold = settings?.lowStockThreshold ?? 5;
        const rows = await prisma.inventoryTracking.findMany({
          where: { shop, productId: { in: ids }, inventoryStatus: { not: "requires_upgrade" } },
          select: { id: true, productId: true, currentQuantity: true },
        });
        await Promise.all(
          rows.map((r) =>
            prisma.inventoryTracking.update({
              where: { id: r.id },
              data: {
                monitoringEnabled: true,
                inventoryStatus: r.currentQuantity <= 0 ? "out_of_stock" : r.currentQuantity <= threshold ? "low_stock" : "in_stock",
              },
            }),
          ),
        );
        updatedCount = new Set(rows.map((r) => r.productId.toString())).size;
      } else {
        // inventoryStatus is the one exception to the manual-edit-path
        // "leave it untouched" rule — see the single-product save above for
        // why: it's what lets plan-limit enforcement tell "merchant turned
        // this off" apart from "benched for being over the cap".
        await prisma.inventoryTracking.updateMany({
          where: { shop, productId: { in: ids } },
          data: { monitoringEnabled: false, inventoryStatus: "deactivated" },
        });
      }
      // Mirror the flag so the inventory webhook's guard sees the same answer
      // — otherwise it keeps enqueueing events for variants the merchant just
      // switched off (or keeps dropping them after switching back on).
      await setInventoryItemMapMonitoring(shop, { productIds: ids }, enabled).catch((err) =>
        console.error("[Products] inventory_item_map monitoring sync failed:", err),
      );
    }
    return { success: true, message: `Monitoring ${enabled ? "enabled" : "disabled"} for ${updatedCount} product(s).` };
  }

  if (intent === "sync") {
    const current = await syncState.get(shop);
    if (current?.running) return { status: "already_running" };

    const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
    const plan = storeSession?.plan ?? "basic";
    const maxProducts = getMaxProducts(plan);
    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;

    await syncState.start(shop);
    runProductSync({
      admin, shop, plan, maxProducts, threshold,
      monitoringFilter: settings?.monitoringFilter ?? "all",
      monitoringCollectionId: settings?.monitoringCollectionId ?? null,
      monitoringTags: settings?.monitoringTags ?? null,
    }).catch(() => {});

    return { status: "started" };
  }

  return { error: "Unknown action." };
};

export default function ProductsPage() {
  const { search, filter, after, prev } = useLoaderData<typeof loader>() as {
    search: string; filter: string; after: string | null; prev: string;
  };
  const setLoaderData = useProductsStore((s) => s.setLoaderData);
  useEffect(() => { setLoaderData({ search, filter, after, prev }); }, [search, filter, after, prev, setLoaderData]);

  useSSECacheStore<ProductsData, ProductsStore>(
    useProductsStore,
    `${search}|${filter}|${after ?? ""}`,
    () => `/api/products-stream?search=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    "products",
  );

  // Gate on the store, not a local hook result — see the rule established
  // in dashboard-store.ts.
  const storeError = useProductsStore((s) => s.error);
  const retry = useProductsStore((s) => s.retry);

  return (
    <s-page heading="Products" sub-heading="Monitor and manage your tracked inventory">
      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry ?? (() => {})} />
      ) : (
        <ProductsPageContent />
      )}
    </s-page>
  );
}

// Always renders the real layout — descendants that read SSE data off the
// store (ProductsTable) compute their own `loading` and apply the shared
// `.skeleton-text` class to just their dynamic value nodes, matching the
// pattern established on the dashboard (see app._index.tsx).
function ProductsPageContent() {
  const loading = useProductsStore((s) => s.data === null);
  const shop = useProductsStore((s) => s.data?.shop) ?? "";
  const plan = useProductsStore((s) => s.data?.plan) ?? "basic";
  // null (not 0) is "not capped" — a loaded Enterprise store has
  // data.maxProducts === null (unlimited), which must stay distinguishable
  // from a real cap of 0. Only the "still loading" case falls back, via the
  // outer `?? null` below, to the same null value, which is fine since the
  // banner below is gated on `!loading` anyway.
  const maxProducts = useProductsStore((s) => s.data?.maxProducts) ?? null;
  const trackedCount = useProductsStore((s) => s.data?.trackedCount) ?? 0;
  const products = useProductsStore((s) => s.data?.products) ?? [];
  const syncRunning = useProductsStore((s) => s.data?.syncRunning) ?? false;
  const lastSyncCompletedAt = useProductsStore((s) => s.data?.lastSyncCompletedAt) ?? null;
  const lastSyncCount = useProductsStore((s) => s.data?.lastSyncCount) ?? null;
  const filter = useProductsStore((s) => s.filter);

  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state === "submitting";

  const { syncPct, syncStreamError, clearError, openStream } = useSyncStream(shop, syncRunning);

  const actionData = useActionData<typeof action>();
  useEffect(() => {
    if (actionData && "status" in actionData && actionData.status === "started") openStream();
  }, [actionData, openStream]);

  const bulkFetcher = useFetcher<typeof action>();
  const csvFetcher = useFetcher<{ csvContent: string; csvFilename: string }>();
  useEffect(() => {
    const { csvContent, csvFilename } = (csvFetcher.data ?? {}) as { csvContent?: string; csvFilename?: string };
    if (!csvContent || !csvFilename) return;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = csvFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }, [csvFetcher.data]);

  // Suppliers + shop locations for the Create Purchase Order modal — fetched
  // lazily (only once the modal is actually opened) via the same resource
  // route/pattern the general Purchase Orders page's picker uses, instead of
  // blocking this page's own loader (which deliberately stays cheap — see
  // its comment — for merchants who never touch purchase orders here).
  const [showCreatePoModal, setShowCreatePoModal] = useState(false);
  const { data: createPoContext } = useSSEData<{ suppliers: { id: string; name: string; paymentTerms: string | null }[]; locations: { id: string; name: string }[] }>(
    showCreatePoModal ? "/api/purchase-order-picker-stream?intent=context" : null,
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());
  const toggleExpandProduct = (productId: string) => {
    setExpandedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  const toggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  const selectableIds = products.filter((p) => p.isTracked).map((p) => p.productId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => { const next = new Set(prev); selectableIds.forEach((id) => next.delete(id)); return next; });
    } else {
      setSelectedIds((prev) => { const next = new Set(prev); selectableIds.forEach((id) => next.add(id)); return next; });
    }
  };

  const submitBulk = (enabled: boolean) => {
    const ids = [...selectedIds].filter((id) => selectableIds.includes(id));
    bulkFetcher.submit(
      { intent: "bulk_monitoring", productIds: JSON.stringify(ids), monitoringEnabled: String(enabled) },
      { method: "post" },
    );
    setSelectedIds(new Set());
  };

  return (
    <>
      <ProductSyncButton
        slot="primary-action"
        pct={syncPct}
        busy={busy}
        onClick={() => { if (syncPct === null && !busy) { clearError(); submit({ intent: "sync" }, { method: "post" }); } }}
      />

      {actionData && "error" in actionData && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#991b1b" }}>
          {actionData.error}
        </div>
      )}
      {(actionData && "message" in actionData || bulkFetcher.data && "message" in bulkFetcher.data) && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#065f46" }}>
          {(bulkFetcher.data && "message" in bulkFetcher.data ? bulkFetcher.data.message : undefined)
            ?? (actionData && "message" in actionData ? actionData.message : undefined)}
        </div>
      )}
      {syncStreamError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ color: "#991b1b", fontSize: 13 }}>{syncStreamError}</span>
          <button
            type="button"
            onClick={() => {
              clearError();
              if (syncPct === null && !busy) submit({ intent: "sync" }, { method: "post" });
            }}
            style={{ flexShrink: 0, padding: "5px 14px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Held back until data confirms it's actually needed, rather than
          reserving space on every load. Only basic/none are capped tiers
          with something to upsell here — pro and enterprise are excluded by
          name rather than by `maxProducts !== null`, since relying on the
          cap alone previously broke for Enterprise (maxProducts is null —
          unlimited — for both "still loading" and "genuinely uncapped",
          which is why this checks the plan directly instead). */}
      {(!loading && (plan === "basic" || plan === "none")) && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
          {getPlanLimits(plan).name} plan: monitoring up to {formatMaxProducts(maxProducts)} products. {trackedCount} of {formatMaxProducts(maxProducts)} tracked.{" "}
          <s-link href="/app/billing">Upgrade to Pro →</s-link>
        </div>
      )}

      {/* Reserved during loading — unlike the plan banner above, most
          returning merchants have synced before, so treating this as "likely
          present" avoids a shift for the common case instead of causing one. */}
      {(loading || lastSyncCompletedAt) && (
        <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>
          <span className={loading ? "skeleton-text" : undefined}>
            Last synced {lastSyncCompletedAt ? timeAgo(lastSyncCompletedAt) : "just now"}{lastSyncCount !== null ? ` · ${lastSyncCount} products` : ""}
          </span>
        </div>
      )}

      <s-section heading="">
        <ProductsToolbar
          onExportCsv={() => csvFetcher.load(`/app/products?intent=export_csv${filter !== "all" ? `&filter=${filter}` : ""}`)}
          exporting={csvFetcher.state !== "idle"}
          onCreatePurchaseOrder={() => setShowCreatePoModal(true)}
          loadingPurchaseOrderContext={showCreatePoModal && !createPoContext}
        />
        <div style={{ marginBottom: 16 }} />

        <ProductsTable
          selectedIds={selectedIds}
          toggleSelect={toggleSelect}
          allSelected={allSelected}
          toggleSelectAll={toggleSelectAll}
          selectableIds={selectableIds}
          expandedProductIds={expandedProductIds}
          toggleExpandProduct={toggleExpandProduct}
        />

        {selectedIds.size > 0 && (
          <ProductsBulkActionBar
            count={selectedIds.size}
            busy={bulkFetcher.state === "submitting"}
            onEnable={() => submitBulk(true)}
            onDisable={() => submitBulk(false)}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        <ProductsPagination />
      </s-section>

      {/* Only mounted once suppliers/locations have actually loaded. The
          modal itself now tolerates a late-arriving suppliers/locations
          prop fine (derived state, not a mount-once snapshot) — this gate
          is purely so the merchant never sees a flash of empty dropdowns
          while the fetch above is still in flight, not a correctness
          requirement anymore. */}
      {showCreatePoModal && createPoContext && (
        <CreatePurchaseOrderModal
          suppliers={createPoContext.suppliers}
          locations={createPoContext.locations}
          onClose={() => setShowCreatePoModal(false)}
        />
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
