import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, useNavigation, useSubmit, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { useCachedSSEData } from "../hooks/use-cached-sse-data";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMaxProducts, canUseFeature, formatMaxProducts, PLAN_LIMITS } from "../lib/plan-limits";
import { enforcePlanLimits } from "../lib/plan-enforcement";
import { syncState } from "../lib/sync-state.server";
import { PRODUCT_METAFIELDS_QUERY } from "../lib/graphql";
import { refreshShopVelocity } from "../lib/velocity.server";
import { ProductEditModal } from "../components/products/ProductEditModal";
import type { ProductRow } from "../components/products/ProductEditModal";
import type { VariantInventory, LocationInventory } from "../components/products/InventorySection";
import { SSEErrorRetry } from "../components/Skeleton";
import { ProductSyncButton } from "../components/products/ProductSyncButton";
import { ProductsToolbar } from "../components/products/ProductsToolbar";
import { ProductsTable } from "../components/products/ProductsTable";
import { ProductsBulkActionBar } from "../components/products/ProductsBulkActionBar";
import { ProductsPagination } from "../components/products/ProductsPagination";
import { mintSseToken } from "../lib/sse-token.server";
import type { ProductsData } from "../lib/products-data.server";
import { useProductsStore } from "../stores/products-store";
import type { InventoryStatus } from "@prisma/client";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

type GraphQLUserError = { field?: string[] | null; message: string };
type GraphQLResponse<T> = {
  data?: T;
  errors?: { message: string }[];
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
};

type InventoryLevelEdge = {
  node: {
    location: { id: string; name: string };
    quantities: Array<{ name: string; quantity: number }>;
  };
};
type ProductInventoryVariantEdge = {
  node: {
    id: string;
    title: string;
    sku: string | null;
    inventoryItem: {
      id: string;
      tracked: boolean;
      inventoryLevels?: { edges: InventoryLevelEdge[] };
    } | null;
  };
};
type ProductInventoryResponse = GraphQLResponse<{
  product: { variants: { edges: ProductInventoryVariantEdge[] } } | null;
}>;

type ProductMetafieldsResponse = GraphQLResponse<{
  product: {
    customThreshold: { id: string; value: string } | null;
    autoHide: { id: string; value: string } | null;
    autoRepublish: { id: string; value: string } | null;
  } | null;
}>;

type CollectionsResponse = GraphQLResponse<{
  collections: {
    edges: Array<{ node: { id: string; title: string; legacyResourceId: string } }>;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
}>;

type SyncProductVariantEdge = {
  node: {
    id: string; title: string; sku: string | null; inventoryQuantity: number | null;
    inventoryItem: { tracked: boolean } | null;
  };
};
type SyncProductEdge = {
  node: {
    id: string; title: string; status: string;
    featuredMedia: { preview: { image: { url: string; altText: string | null } | null } | null } | null;
    customThreshold: { value: string } | null;
    variants: { edges: SyncProductVariantEdge[] };
  };
};
type SyncProductsResponse = GraphQLResponse<{
  products: { edges: SyncProductEdge[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
}>;

type InventoryItemUpdateResponse = GraphQLResponse<{
  inventoryItemUpdate: { inventoryItem: { id: string; tracked: boolean } | null; userErrors: GraphQLUserError[] };
}>;
type ProductUpdateResponse = GraphQLResponse<{
  productUpdate: { product: { id: string; status: string } | null; userErrors: GraphQLUserError[] };
}>;
type InventorySetQuantitiesResponse = GraphQLResponse<{
  inventorySetQuantities: { userErrors: GraphQLUserError[] };
}>;
type MetafieldsSetResponse = GraphQLResponse<{
  metafieldsSet: { userErrors: GraphQLUserError[] };
}>;
type MetafieldInput = { ownerId: string; namespace: string; key: string; value: string; type: string };

type SyncVariantRow = {
  productId: bigint; variantId: bigint; productTitle: string; variantTitle: string | null;
  sku: string | null; currentQuantity: number; inventoryStatus: "in_stock" | "low_stock" | "out_of_stock";
  imageUrl: string | null; imageAlt: string | null;
};

const SYNC_PRODUCTS_GRAPHQL = `
  query getProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id title status
          featuredMedia { preview { image { url altText } } }
          customThreshold: metafield(namespace: "stock_alert", key: "custom_threshold") { value }
          variants(first: 100) {
            edges {
              node {
                id title sku inventoryQuantity
                inventoryItem { tracked }
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

const INVENTORY_ITEM_UPDATE_MUTATION = `
  mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id tracked }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation productUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product { id status }
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }
`;

const PRODUCT_INVENTORY_QUERY = `
  query getProductInventory($id: ID!) {
    product(id: $id) {
      variants(first: 100) {
        edges {
          node {
            id title sku
            inventoryItem {
              id tracked
              inventoryLevels(first: 50) {
                edges {
                  node {
                    location { id name }
                    quantities(names: ["available"]) { name quantity }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

const METAFIELDS_DELETE_MUTATION = `
  mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key namespace ownerId }
      userErrors { field message }
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

  if (url.searchParams.get("intent") === "get_product_inventory") {
    const productId = url.searchParams.get("productId") as string;
    try {
      const res = await admin.graphql(PRODUCT_INVENTORY_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const json: ProductInventoryResponse = await res.json();

      if (json.errors?.length) {
        const msg = json.errors.map((e) => e.message).join("; ");
        console.error("[get_product_inventory] GraphQL errors:", msg);
        return { inventoryData: null, inventoryError: `GraphQL error: ${msg}` };
      }

      const variants: VariantInventory[] = (json.data?.product?.variants?.edges ?? []).map((e) => {
        const v = e.node;
        const locations: LocationInventory[] = (v.inventoryItem?.inventoryLevels?.edges ?? []).map((le) => {
          const quantities = le.node.quantities ?? [];
          const available = quantities.find((q) => q.name === "available");
          return {
            locationId: le.node.location.id,
            locationName: le.node.location.name,
            quantity: available?.quantity ?? 0,
          };
        });
        return {
          id: v.id,
          title: v.title,
          sku: v.sku || null,
          inventoryItemId: v.inventoryItem?.id ?? null,
          tracked: v.inventoryItem?.tracked ?? false,
          locations,
        };
      });

      return { inventoryData: { variants } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[get_product_inventory] Exception:", msg);
      return { inventoryData: null, inventoryError: `Error: ${msg}` };
    }
  }

  if (url.searchParams.get("intent") === "get_product_settings") {
    const productId = url.searchParams.get("productId") as string;
    try {
      const res = await admin.graphql(PRODUCT_METAFIELDS_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const json: ProductMetafieldsResponse = await res.json();
      const p = json.data?.product;
      return {
        productSettings: {
          customThreshold: p?.customThreshold?.value ?? "",
          customThresholdId: p?.customThreshold?.id ?? null,
          autoHide: p?.autoHide?.value !== undefined ? p.autoHide.value === "true" : null,
          autoRepublish: p?.autoRepublish?.value !== undefined ? p.autoRepublish.value === "true" : null,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { productSettings: null, settingsError: msg };
    }
  }

  const search = url.searchParams.get("search") ?? "";
  const after = url.searchParams.get("after") ?? null;
  const prev = url.searchParams.get("prev") ?? "";
  const filter = url.searchParams.get("filter") ?? "all";

  // This is the actual page render. The Shopify product fetch + DB lookups run
  // entirely in the background via api.products-stream.ts (which re-derives its
  // own admin client from the shop via unauthenticated.admin, since EventSource
  // can't carry this request's session-token auth) and stream to the client
  // over SSE once ready.
  const token = await mintSseToken(shop);
  return { search, filter, after, prev, token };
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
            update: { productTitle: v.productTitle, variantTitle: v.variantTitle, sku: v.sku, currentQuantity: v.currentQuantity, inventoryStatus: v.inventoryStatus, imageUrl: v.imageUrl, imageAlt: v.imageAlt, lastCheckedAt: now },
            create: { shop, productId: v.productId, variantId: v.variantId, productTitle: v.productTitle, variantTitle: v.variantTitle, sku: v.sku, currentQuantity: v.currentQuantity, previousQuantity: v.currentQuantity, inventoryStatus: v.inventoryStatus, imageUrl: v.imageUrl, imageAlt: v.imageAlt },
          }),
        ),
      );
      const dbPct = 82 + Math.round(((i + chunk.length) / allVariants.length) * 16);
      await syncState.progress(shop, dbPct);
    }

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

    // Velocity calculation — query last 30 days of orders to compute avg daily
    // sales. avgDailySales/stockOutDays stay product-wide (velocity.server.ts
    // only resolves orders down to the product level, not variant), so each
    // variant's stockOutDays is "this variant's own quantity against the
    // product's blended sales rate" — a reasonable approximation until
    // per-variant velocity is added. Same shared function the daily velocity
    // cron uses (see workers/inventory-buffer.worker.ts) — a manual sync just
    // gets an on-demand refresh instead of waiting for the next cron run.
    try {
      await syncState.progress(shop, 99);
      const { updatedProducts } = await refreshShopVelocity(shop, admin);
      console.log(`[Sync] Velocity updated for ${updatedProducts} product(s) in ${shop}`);
    } catch (err) {
      console.warn(`[Sync] Velocity calc failed for ${shop}:`, err instanceof Error ? err.message : err);
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

    await syncState.done(shop, seenProductIds.size);
  } catch (err) {
    await syncState.fail(shop, err instanceof Error ? err.message : "Unknown error");
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "update_product") {
    const productId = form.get("productId") as string;
    const shopifyStatus = form.get("shopifyStatus") as string;
    const tracked = form.get("tracked") === "true";
    const monitoringEnabled = form.get("monitoringEnabled") === "true";
    const productTitle = form.get("productTitle") as string;
    const shopifyInventoryItemId = (form.get("shopifyInventoryItemId") as string) || null;

    let inventoryUpdates: Array<{ inventoryItemId: string; locationId: string; quantity: number }> = [];
    try {
      const raw = form.get("inventoryUpdates") as string;
      if (raw) inventoryUpdates = JSON.parse(raw);
    } catch { /* ignore parse errors */ }

    const errors: string[] = [];

    if (tracked && shopifyInventoryItemId) {
      try {
        const res = await admin.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
          variables: { id: shopifyInventoryItemId, input: { tracked: true } },
        });
        const json: InventoryItemUpdateResponse = await res.json();
        const errs = json.data?.inventoryItemUpdate?.userErrors ?? [];
        if (errs.length > 0) errors.push(errs.map((e) => e.message).join(", "));
      } catch (err) {
        errors.push(`Inventory tracking enable failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    try {
      const res = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
        variables: { product: { id: `gid://shopify/Product/${productId}`, status: shopifyStatus } },
      });
      const json: ProductUpdateResponse = await res.json();
      const errs = json.data?.productUpdate?.userErrors ?? [];
      if (errs.length > 0) errors.push(errs.map((e) => e.message).join(", "));
    } catch (err) {
      errors.push(`Status update failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }

    if (inventoryUpdates.length > 0) {
      try {
        const invRes = await admin.graphql(INVENTORY_SET_MUTATION, {
          variables: {
            idempotencyKey: crypto.randomUUID(),
            input: {
              name: "available",
              reason: "correction",
              quantities: inventoryUpdates.map((u) => ({ ...u, changeFromQuantity: null })),
            },
          },
        });
        const invJson: InventorySetQuantitiesResponse = await invRes.json();
        const invErrs = invJson.data?.inventorySetQuantities?.userErrors ?? [];
        if (invErrs.length > 0) errors.push(invErrs.map((e) => e.message).join(", "));
      } catch (err) {
        errors.push(`Quantity update failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;
    const existingRows = await prisma.inventoryTracking.findMany({
      where: { shop, productId: BigInt(productId) },
    });

    const rawManualSales = ((form.get("manualDailySales") as string) ?? "").trim();
    const manualDailySales = rawManualSales !== "" && !isNaN(parseFloat(rawManualSales)) ? parseFloat(rawManualSales) : null;
    const rawRestockDate = ((form.get("expectedRestockDate") as string) ?? "").trim();
    const expectedRestockDate = rawRestockDate ? new Date(rawRestockDate) : null;

    // Per-product custom thresholds are a Pro feature; ignore the submitted
    // value for basic stores. Read from the form (rather than re-fetching the
    // metafield) since this same submission is about to write it below.
    const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
    const plan = storeSession?.plan ?? "basic";

    // Supplier/unit cost are an Enterprise feature — silently leave any
    // existing value untouched (rather than erroring the whole save, or
    // clearing it) when the plan doesn't have access, since a stale form
    // submission from a since-downgraded plan must still degrade gracefully
    // (the modal itself hides these fields when gated).
    const canManageSupplier = canUseFeature(plan, "purchaseOrders");
    const rawSupplierId = ((form.get("supplierId") as string) ?? "").trim();
    const rawUnitCost = ((form.get("unitCost") as string) ?? "").trim();
    const supplierFields = canManageSupplier
      ? {
          supplierId: rawSupplierId || null,
          unitCost: rawUnitCost !== "" && !isNaN(parseFloat(rawUnitCost)) ? parseFloat(rawUnitCost) : null,
        }
      : {};

    const customThresholdRaw = ((form.get("customThreshold") as string) ?? "").trim();
    const parsedCustomThreshold = customThresholdRaw !== "" ? parseInt(customThresholdRaw) : NaN;
    const effectiveThreshold =
      canUseFeature(plan, "perProductThresholds") && !isNaN(parsedCustomThreshold) && parsedCustomThreshold >= 0
        ? parsedCustomThreshold
        : threshold;

    if (tracked) {
      // Re-derive the authoritative variant list straight from Shopify
      // (rather than trusting a client-submitted snapshot) so this write
      // never depends on the modal's inventory fetch having completed in
      // time — that snapshot could be empty or stale, silently dropping the
      // DB write while the Shopify-side mutations above still succeed.
      let variantsFresh: Array<{ variantId: string; variantTitle: string | null; sku: string | null; qty: number }> = [];
      try {
        const res = await admin.graphql(PRODUCT_INVENTORY_QUERY, {
          variables: { id: `gid://shopify/Product/${productId}` },
        });
        const json: ProductInventoryResponse = await res.json();
        if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
        const edges = json.data?.product?.variants?.edges ?? [];
        variantsFresh = edges
          .filter((e) => e.node.inventoryItem?.tracked !== false)
          .map((e) => {
            const v = e.node;
            const qty = (v.inventoryItem?.inventoryLevels?.edges ?? []).reduce((sum: number, le) => {
              const avail = (le.node.quantities ?? []).find((q) => q.name === "available");
              return sum + (avail?.quantity ?? 0);
            }, 0);
            return { variantId: v.id.split("/").pop() as string, variantTitle: v.title ?? null, sku: v.sku || null, qty };
          });
      } catch (err) {
        errors.push(`Failed to refresh inventory: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      const existingByVariantId = new Map(existingRows.map((r) => [r.variantId.toString(), r]));

      for (const v of variantsFresh) {
        const existingRow = existingByVariantId.get(v.variantId);

        if (existingRow) {
          // currentQuantity/inventoryStatus are deliberately left untouched
          // here — writing them directly made the real inventory webhook see
          // "no change" right after a manual edit, silently swallowing its
          // alert (the webhook is the only place that decides whether to
          // notify). The webhook is now the sole source of truth for
          // quantity/status; this save only touches fields it doesn't own.
          // stockOutDays is recomputed off the currently-stored quantity so
          // it still updates immediately when just the sales estimate changes.
          const effectiveSales = manualDailySales ?? existingRow.avgDailySales ?? null;
          const stockOutDays = effectiveSales
            ? Math.min(999, Math.ceil(existingRow.currentQuantity / effectiveSales))
            : undefined;

          // A product benched by plan-limit enforcement can't be re-enabled
          // from here — that would let a merchant self-service past their
          // plan's product cap without upgrading.
          const isPlanBenched = existingRow.inventoryStatus === "requires_upgrade";
          const effectiveMonitoringEnabled = isPlanBenched ? false : monitoringEnabled;

          // inventoryStatus is the one exception to "leave it untouched"
          // above: the monitoring toggle owns it at the exact moment it
          // flips, so plan-limit enforcement can tell "merchant turned this
          // off" apart from "benched for being over the cap" (see
          // BENCHED_STATUSES in plan-enforcement.ts). Turning back on
          // recomputes the real stock status immediately — otherwise it
          // would stay stuck 'deactivated' forever, since the inventory
          // webhook skips any row whose previous status was 'deactivated'.
          const monitoringChanged = !isPlanBenched && effectiveMonitoringEnabled !== existingRow.monitoringEnabled;
          const recomputedStatus: "in_stock" | "low_stock" | "out_of_stock" =
            existingRow.currentQuantity <= 0
              ? "out_of_stock"
              : existingRow.currentQuantity <= effectiveThreshold
              ? "low_stock"
              : "in_stock";
          const statusPatch = !monitoringChanged
            ? {}
            : effectiveMonitoringEnabled
            ? { inventoryStatus: recomputedStatus }
            : { inventoryStatus: "deactivated" as const };

          await prisma.inventoryTracking.update({
            where: { id: existingRow.id },
            data: {
              productTitle,
              variantTitle: v.variantTitle,
              sku: v.sku,
              monitoringEnabled: effectiveMonitoringEnabled,
              manualDailySales,
              expectedRestockDate,
              ...statusPatch,
              ...(stockOutDays !== undefined ? { stockOutDays } : {}),
              ...supplierFields,
            },
          });
        } else {
          // First time this variant is tracked — no webhook history exists
          // yet to fall back on, so seed its baseline quantity/status now
          // (same reasoning as the PRODUCTS_CREATE webhook: nothing to
          // compare against yet, so no transition alert is expected here).
          const invStatus: "in_stock" | "low_stock" | "out_of_stock" =
            v.qty <= 0 ? "out_of_stock" : v.qty <= effectiveThreshold ? "low_stock" : "in_stock";
          await prisma.inventoryTracking.create({
            data: {
              shop,
              productId: BigInt(productId),
              variantId: BigInt(v.variantId),
              productTitle,
              variantTitle: v.variantTitle,
              sku: v.sku,
              currentQuantity: v.qty,
              previousQuantity: v.qty,
              inventoryStatus: invStatus,
              monitoringEnabled,
              manualDailySales,
              expectedRestockDate,
              ...supplierFields,
            },
          });
        }
      }
      // Deliberately no pruning here. A single post-mutation re-fetch is
      // exactly the kind of read that can catch Shopify's inventoryItem
      // eventual-consistency window right after writing new inventory levels
      // (variants missing or briefly reporting tracked:false) — the sync
      // path hit this same class of bug when it tried to prune off of one
      // fetch's result. Removing a variant's tracking is the sync's job,
      // where it can be reasoned about across the whole catalog; a save on
      // this one product should only ever add or update.
    } else if (existingRows.length > 0) {
      await prisma.inventoryTracking.deleteMany({ where: { shop, productId: BigInt(productId) } });
    }

    if (tracked) {
      const autoHide = form.get("autoHide") === "true";
      const autoRepublish = form.get("autoRepublish") === "true";
      const customThresholdMetafieldId = ((form.get("customThresholdMetafieldId") as string) ?? "").trim() || null;
      const ownerId = `gid://shopify/Product/${productId}`;

      const metafieldsToSet: MetafieldInput[] = [
        { ownerId, namespace: "stock_alert", key: "auto_hide", value: String(autoHide), type: "boolean" },
        { ownerId, namespace: "stock_alert", key: "auto_republish", value: String(autoRepublish), type: "boolean" },
      ];

      if (!isNaN(parsedCustomThreshold) && parsedCustomThreshold >= 0) {
        metafieldsToSet.push({ ownerId, namespace: "stock_alert", key: "custom_threshold", value: String(parsedCustomThreshold), type: "number_integer" });
      }

      try {
        const mfRes = await admin.graphql(METAFIELDS_SET_MUTATION, { variables: { metafields: metafieldsToSet } });
        const mfJson: MetafieldsSetResponse = await mfRes.json();
        const mfErrs = mfJson.data?.metafieldsSet?.userErrors ?? [];
        if (mfErrs.length > 0) errors.push(mfErrs.map((e) => e.message).join(", "));
      } catch (err) {
        errors.push(`Metafield update failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      if (customThresholdRaw === "" && customThresholdMetafieldId) {
        try {
          await admin.graphql(METAFIELDS_DELETE_MUTATION, {
            variables: { metafields: [{ ownerId, namespace: "stock_alert", key: "custom_threshold" }] },
          });
        } catch {
          // Non-critical
        }
      }
    }

    if (errors.length > 0) return { error: errors.join(" | "), updatedProductId: productId };
    return { success: true, message: "Product updated successfully.", updatedProductId: productId };
  }

  if (intent === "enable_and_fetch_inventory") {
    const productId = form.get("productId") as string;
    try {
      const invRes = await admin.graphql(PRODUCT_INVENTORY_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const invJson: ProductInventoryResponse = await invRes.json();
      const edges = invJson.data?.product?.variants?.edges ?? [];

      for (const edge of edges) {
        const itemId = edge.node.inventoryItem?.id;
        if (itemId && !edge.node.inventoryItem?.tracked) {
          await admin.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
            variables: { id: itemId, input: { tracked: true } },
          });
        }
      }

      const variants: VariantInventory[] = edges.map((e) => {
        const v = e.node;
        const locations: LocationInventory[] = (v.inventoryItem?.inventoryLevels?.edges ?? []).map((le) => {
          const available = (le.node.quantities ?? []).find((q) => q.name === "available");
          return { locationId: le.node.location.id, locationName: le.node.location.name, quantity: available?.quantity ?? 0 };
        });
        return { id: v.id, title: v.title, sku: v.sku || null, inventoryItemId: v.inventoryItem?.id ?? null, tracked: true, locations };
      });

      return { enabledInventory: { variants } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

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
  const { search, filter, after, prev, token } = useLoaderData<typeof loader>() as {
    search: string; filter: string; after: string | null; prev: string; token: string;
  };
  const setLoaderData = useProductsStore((s) => s.setLoaderData);
  useEffect(() => { setLoaderData({ search, filter, after, prev }); }, [search, filter, after, prev, setLoaderData]);

  const cachedData = useProductsStore((s) => s.data);
  const cachedKey = useProductsStore((s) => s.lastKey);
  const lastFetchedAt = useProductsStore((s) => s.lastFetchedAt);
  const setSSEState = useProductsStore((s) => s.setSSEState);
  useCachedSSEData<ProductsData>(
    `${search}|${filter}|${after ?? ""}`,
    () => `/api/products-stream?token=${encodeURIComponent(token)}&search=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
    "products",
    cachedData,
    cachedKey,
    lastFetchedAt,
    setSSEState,
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
  const maxProducts = useProductsStore((s) => s.data?.maxProducts) ?? 0;
  const trackedCount = useProductsStore((s) => s.data?.trackedCount) ?? 0;
  const threshold = useProductsStore((s) => s.data?.threshold) ?? 5;
  const products = useProductsStore((s) => s.data?.products) ?? [];
  const syncRunning = useProductsStore((s) => s.data?.syncRunning) ?? false;
  const lastSyncCompletedAt = useProductsStore((s) => s.data?.lastSyncCompletedAt) ?? null;
  const lastSyncCount = useProductsStore((s) => s.data?.lastSyncCount) ?? null;
  const autoHideEnabled = useProductsStore((s) => s.data?.autoHideEnabled) ?? false;
  const autoRepublishEnabled = useProductsStore((s) => s.data?.autoRepublishEnabled) ?? false;
  const suppliers = useProductsStore((s) => s.data?.suppliers) ?? [];
  const filter = useProductsStore((s) => s.filter);
  const applyOptimisticPatch = useProductsStore((s) => s.applyOptimisticPatch);

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

  const [saveErrorAfterClose, setSaveErrorAfterClose] = useState<string | null>(null);

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

  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);

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
      {saveErrorAfterClose && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#991b1b", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>{saveErrorAfterClose}</span>
          <button onClick={() => setSaveErrorAfterClose(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontSize: 16, lineHeight: 1, padding: 0 }} aria-label="Dismiss">
            ✕
          </button>
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
          reserving space on every load. */}
      {(!loading && Number.isFinite(maxProducts) && plan !== "pro") && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
          {PLAN_LIMITS[plan === "basic" ? "basic" : "none"].name} plan: monitoring up to {formatMaxProducts(maxProducts)} products. {trackedCount} of {formatMaxProducts(maxProducts)} tracked.{" "}
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
          onEditProduct={setEditProduct}
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

      {editProduct && (
        <ProductEditModal
          product={editProduct}
          plan={plan}
          threshold={threshold}
          autoHideEnabled={autoHideEnabled}
          autoRepublishEnabled={autoRepublishEnabled}
          suppliers={suppliers}
          onClose={() => setEditProduct(null)}
          onSaved={(patch) => applyOptimisticPatch(editProduct.productId, patch)}
          onSaveError={(message) => setSaveErrorAfterClose(message)}
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
