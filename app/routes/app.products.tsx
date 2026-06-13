import { useState, useEffect, useRef } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, Link, useNavigation, useSubmit, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMaxProducts } from "../lib/plan-limits";
import { enforcePlanLimits } from "../lib/plan-enforcement";
import { syncState } from "../lib/sync-state.server";

const PRODUCTS_GRAPHQL = `
  query getProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id title status
          featuredImage { url altText }
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

const SYNC_PRODUCTS_GRAPHQL = `
  query getProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id title status
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

const INVENTORY_ITEM_UPDATE_MUTATION = `
  mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id tracked }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `
  mutation productUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id status }
      userErrors { field message }
    }
  }
`;

const INVENTORY_SET_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
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

const PRODUCT_SETTINGS_QUERY = `
  query getProductSettings($id: ID!) {
    product(id: $id) {
      customThreshold: metafield(namespace: "stock_alert", key: "custom_threshold") { id value }
      autoHide: metafield(namespace: "stock_alert", key: "auto_hide") { id value }
      autoRepublish: metafield(namespace: "stock_alert", key: "auto_republish") { id value }
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

const METAFIELD_DELETE_MUTATION = `
  mutation metafieldDelete($input: MetafieldDeleteInput!) {
    metafieldDelete(input: $input) {
      deletedId
      userErrors { field message }
    }
  }
`;

type ProductSettings = {
  customThreshold: string;
  customThresholdId: string | null;
  autoHide: boolean | null;
  autoRepublish: boolean | null;
};

type LocationInventory = { locationId: string; locationName: string; quantity: number };
type VariantInventory = {
  id: string;
  title: string;
  sku: string | null;
  inventoryItemId: string | null;
  tracked: boolean;
  locations: LocationInventory[];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  // Early return for per-product inventory fetch (used by edit modal)
  if (url.searchParams.get("intent") === "get_product_inventory") {
    const productId = url.searchParams.get("productId") as string;
    try {
      const res = await admin.graphql(PRODUCT_INVENTORY_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const json: any = await res.json();

      // Surface GraphQL-level errors to the frontend for debugging
      if (json.errors?.length) {
        const msg = json.errors.map((e: any) => e.message).join("; ");
        console.error("[get_product_inventory] GraphQL errors:", msg);
        return { inventoryData: null, inventoryError: `GraphQL error: ${msg}` };
      }

      const variants: VariantInventory[] = (json.data?.product?.variants?.edges ?? []).map((e: any) => {
        const v = e.node;
        const locations: LocationInventory[] = (v.inventoryItem?.inventoryLevels?.edges ?? []).map((le: any) => {
          const quantities: any[] = le.node.quantities ?? [];
          const available = quantities.find((q: any) => q.name === "available");
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
      const res = await admin.graphql(PRODUCT_SETTINGS_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const json: any = await res.json();
      const p = json.data?.product;
      return {
        productSettings: {
          customThreshold: p?.customThreshold?.value ?? "",
          customThresholdId: p?.customThreshold?.id ?? null,
          autoHide: p?.autoHide?.value !== undefined ? p.autoHide.value === "true" : null,
          autoRepublish: p?.autoRepublish?.value !== undefined ? p.autoRepublish.value === "true" : null,
        } as ProductSettings,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { productSettings: null, settingsError: msg };
    }
  }

  const search = url.searchParams.get("search") ?? "";
  const after = url.searchParams.get("after") ?? null;
  const prev = url.searchParams.get("prev") ?? "";   // comma-separated stack of previous page cursors
  const filter = url.searchParams.get("filter") ?? "all";
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

    const imageUrl: string | null = p.featuredImage?.url ?? null;
    const imageAlt: string = p.featuredImage?.altText ?? (p.title as string);
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
    filter === "tracked"
      ? allProducts.filter((p) => p.isTracked)
      : filter === "not_tracked"
      ? allProducts.filter((p) => !p.isTracked)
      : allProducts;

  return {
    shop, plan, maxProducts, trackedCount, threshold, products, pageInfo, search, filter, after, prev,
    syncRunning: shopSyncState?.running ?? false,
    lastSyncCompletedAt: shopSyncState?.completedAt?.toISOString() ?? null,
    lastSyncCount: shopSyncState?.syncedCount ?? null,
    autoHideEnabled: settings?.autoHideEnabled ?? false,
    autoRepublishEnabled: settings?.autoRepublishEnabled ?? false,
  };
};

async function runProductSync({ admin, shop, plan, maxProducts, threshold }: {
  admin: any; shop: string; plan: string; maxProducts: number; threshold: number;
}) {
  let allProducts: any[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  try {
    // Phase 1: Fetch products from Shopify (5% → 80%)
    while (hasNextPage && allProducts.length < maxProducts) {
      const batchSize = Math.min(250, maxProducts - allProducts.length);
      const gqlResponse = await admin.graphql(SYNC_PRODUCTS_GRAPHQL, {
        variables: { first: batchSize, after: cursor },
      });
      const gqlJson: any = await gqlResponse.json();

      // Shopify leaky-bucket: back off before the next request if available
      // capacity is close to zero to avoid THROTTLED errors mid-sync.
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
        const productId = p.id.split("/").pop();
        let totalQty = 0;
        const skus: string[] = [];
        let allUntracked = true;

        for (const ve of p.variants.edges) {
          const v = ve.node;
          if (v.inventoryItem?.tracked !== false) allUntracked = false;
          totalQty += v.inventoryQuantity ?? 0;
          if (v.sku) skus.push(v.sku);
        }

        if (allUntracked) continue;

        const status: "in_stock" | "low_stock" | "out_of_stock" =
          totalQty <= 0 ? "out_of_stock" : totalQty <= threshold ? "low_stock" : "in_stock";

        allProducts.push({ productId: BigInt(productId), productTitle: p.title, sku: skus.join(", ") || null, currentQuantity: totalQty, inventoryStatus: status });
      }

      hasNextPage = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;

      // Report fetch progress: 5% base + up to 75% based on fetched vs maxProducts
      const fetchPct = Math.min(80, 5 + Math.round((allProducts.length / maxProducts) * 75));
      await syncState.progress(shop, fetchPct);
    }

    // Phase 2: Write to database in chunks of 100 (80% → 98%)
    // Batching inside a transaction cuts roundtrips from N to ceil(N/100).
    await syncState.progress(shop, 82);
    const CHUNK = 100;
    const now = new Date();
    for (let i = 0; i < allProducts.length; i += CHUNK) {
      const chunk = allProducts.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((p) =>
          prisma.inventoryTracking.upsert({
            where: { shop_productId: { shop, productId: p.productId } },
            update: { productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus, lastCheckedAt: now },
            create: { shop, productId: p.productId, productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, previousQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus },
          }),
        ),
      );
      const dbPct = 82 + Math.round(((i + chunk.length) / allProducts.length) * 16);
      await syncState.progress(shop, dbPct);
    }

    // Phase 3: Remove tracking rows for products no longer in Shopify.
    // Without this, deleted products accumulate forever and inflate the tracked count.
    if (allProducts.length > 0) {
      const syncedIds = allProducts.map((p) => p.productId);
      const { count: pruned } = await prisma.inventoryTracking.deleteMany({
        where: { shop, productId: { notIn: syncedIds } },
      });
      if (pruned > 0) {
        console.log(`[Sync] Pruned ${pruned} stale tracking row(s) for ${shop}`);
      }
    }

    await prisma.setupProgress.upsert({
      where: { shop },
      update: { firstProductTracked: true, productThresholdsConfigured: true },
      create: { shop, appInstalled: true, firstProductTracked: true, productThresholdsConfigured: true, globalSettingsConfigured: false, notificationsConfigured: false },
    });

    // Deactivate rows beyond the plan cap so the merchant can't silently exceed their limit.
    const enforcement = await enforcePlanLimits(shop, plan);
    if (enforcement.deactivatedCount > 0) {
      console.log(`[Sync] Plan limit enforced for ${shop}: deactivated ${enforcement.deactivatedCount} products (max ${enforcement.maxAllowed})`);
    }

    await syncState.done(shop, allProducts.length);
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

    // Parse inventory updates: [{ inventoryItemId, locationId, quantity }]
    let inventoryUpdates: Array<{ inventoryItemId: string; locationId: string; quantity: number }> = [];
    try {
      const raw = form.get("inventoryUpdates") as string;
      if (raw) inventoryUpdates = JSON.parse(raw);
    } catch { /* ignore parse errors */ }

    const errors: string[] = [];

    // 1. If enabling tracking, first enable Shopify-side inventory tracking on the item
    if (tracked && shopifyInventoryItemId) {
      try {
        const res = await admin.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
          variables: { id: shopifyInventoryItemId, input: { tracked: true } },
        });
        const json: any = await res.json();
        const errs = json.data?.inventoryItemUpdate?.userErrors ?? [];
        if (errs.length > 0) errors.push(errs.map((e: any) => e.message).join(", "));
      } catch (err) {
        errors.push(`Inventory tracking enable failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // 2. Update Shopify product status
    try {
      const res = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
        variables: { input: { id: `gid://shopify/Product/${productId}`, status: shopifyStatus } },
      });
      const json: any = await res.json();
      const errs = json.data?.productUpdate?.userErrors ?? [];
      if (errs.length > 0) errors.push(errs.map((e: any) => e.message).join(", "));
    } catch (err) {
      errors.push(`Status update failed: ${err instanceof Error ? err.message : "Unknown"}`);
    }

    // 2. Batch-update inventory quantities across all locations
    if (inventoryUpdates.length > 0) {
      try {
        const invRes = await admin.graphql(INVENTORY_SET_MUTATION, {
          variables: {
            input: {
              name: "available",
              reason: "correction",
              ignoreCompareQuantity: true,
              quantities: inventoryUpdates,
            },
          },
        });
        const invJson: any = await invRes.json();
        const invErrs = invJson.data?.inventorySetQuantities?.userErrors ?? [];
        if (invErrs.length > 0) errors.push(invErrs.map((e: any) => e.message).join(", "));
      } catch (err) {
        errors.push(`Quantity update failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // 3. Update InventoryTracking in DB
    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;
    const existing = await prisma.inventoryTracking.findUnique({
      where: { shop_productId: { shop, productId: BigInt(productId) } },
    });

    if (tracked) {
      const totalQty = inventoryUpdates.reduce((sum, u) => sum + u.quantity, 0);
      const qty = inventoryUpdates.length > 0 ? totalQty : (existing?.currentQuantity ?? 0);
      const invStatus: "in_stock" | "low_stock" | "out_of_stock" =
        qty <= 0 ? "out_of_stock" : qty <= threshold ? "low_stock" : "in_stock";
      if (existing) {
        await prisma.inventoryTracking.update({
          where: { id: existing.id },
          data: { ...(inventoryUpdates.length > 0 ? { currentQuantity: qty, inventoryStatus: invStatus } : {}), monitoringEnabled, lastCheckedAt: new Date() },
        });
      } else {
        await prisma.inventoryTracking.create({
          data: { shop, productId: BigInt(productId), productTitle, currentQuantity: qty, previousQuantity: 0, inventoryStatus: invStatus, monitoringEnabled },
        });
      }
    } else if (existing) {
      await prisma.inventoryTracking.deleteMany({ where: { shop, productId: BigInt(productId) } });
    }

    // 4. Update per-product metafields (only when tracking is enabled)
    if (tracked) {
      const customThresholdRaw = ((form.get("customThreshold") as string) ?? "").trim();
      const autoHide = form.get("autoHide") === "true";
      const autoRepublish = form.get("autoRepublish") === "true";
      const customThresholdMetafieldId = ((form.get("customThresholdMetafieldId") as string) ?? "").trim() || null;
      const ownerId = `gid://shopify/Product/${productId}`;

      const metafieldsToSet: any[] = [
        { ownerId, namespace: "stock_alert", key: "auto_hide", value: String(autoHide), type: "boolean" },
        { ownerId, namespace: "stock_alert", key: "auto_republish", value: String(autoRepublish), type: "boolean" },
      ];

      const parsedThreshold = customThresholdRaw !== "" ? parseInt(customThresholdRaw) : NaN;
      if (!isNaN(parsedThreshold) && parsedThreshold >= 0) {
        metafieldsToSet.push({ ownerId, namespace: "stock_alert", key: "custom_threshold", value: String(parsedThreshold), type: "number_integer" });
      }

      try {
        const mfRes = await admin.graphql(METAFIELDS_SET_MUTATION, { variables: { metafields: metafieldsToSet } });
        const mfJson: any = await mfRes.json();
        const mfErrs = mfJson.data?.metafieldsSet?.userErrors ?? [];
        if (mfErrs.length > 0) errors.push(mfErrs.map((e: any) => e.message).join(", "));
      } catch (err) {
        errors.push(`Metafield update failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      // If threshold cleared but a metafield existed, delete it from Shopify
      if (customThresholdRaw === "" && customThresholdMetafieldId) {
        try {
          await admin.graphql(METAFIELD_DELETE_MUTATION, { variables: { input: { id: customThresholdMetafieldId } } });
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
      // Step 1: fetch inventory to get inventoryItemIds
      const invRes = await admin.graphql(PRODUCT_INVENTORY_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const invJson: any = await invRes.json();
      const edges = invJson.data?.product?.variants?.edges ?? [];

      // Step 2: enable Shopify tracking on every untracked variant
      for (const edge of edges) {
        const itemId = edge.node.inventoryItem?.id;
        if (itemId && !edge.node.inventoryItem.tracked) {
          await admin.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
            variables: { id: itemId, input: { tracked: true } },
          });
        }
      }

      // Step 3: return inventory data (mark all as tracked now)
      const variants: VariantInventory[] = edges.map((e: any) => {
        const v = e.node;
        const locations: LocationInventory[] = (v.inventoryItem?.inventoryLevels?.edges ?? []).map((le: any) => {
          const available = (le.node.quantities ?? []).find((q: any) => q.name === "available");
          return { locationId: le.node.location.id, locationName: le.node.location.name, quantity: available?.quantity ?? 0 };
        });
        return { id: v.id, title: v.title, sku: v.sku || null, inventoryItemId: v.inventoryItem?.id ?? null, tracked: true, locations };
      });

      return { enabledInventory: { variants } };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Unknown error" };
    }
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

    // Fire and forget — do not await
    runProductSync({ admin, shop, plan, maxProducts, threshold }).catch(() => {});

    return { status: "started" };
  }

  return { error: "Unknown action." };
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  in_stock: { bg: "#d1fae5", color: "#065f46", label: "In Stock" },
  low_stock: { bg: "#fef3c7", color: "#92400e", label: "Low Stock" },
  out_of_stock: { bg: "#fee2e2", color: "#991b1b", label: "Out of Stock" },
  deactivated: { bg: "#f3f4f6", color: "#374151", label: "Deactivated" },
  not_tracked: { bg: "#ede9fe", color: "#5b21b6", label: "Not Tracked" },
};

const FILTER_TABS = [
  { key: "all", label: "All Products" },
  { key: "tracked", label: "Tracked" },
  { key: "not_tracked", label: "Not Tracked" },
];

const SHOPIFY_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Unlisted" },
];

type ProductRow = {
  id: string | number;
  productId: string;
  productTitle: string;
  sku: string | null;
  currentQuantity: number;
  inventoryStatus: string;
  isHidden: boolean;
  isTracked: boolean;
  monitoringEnabled: boolean;
  imageUrl: string | null;
  imageAlt: string;
  shopifyStatus: string;
  inventoryItemId: string | null;
};

function InventorySection({
  variants,
  loading,
  error,
  edits,
  expanded,
  onEdit,
  onToggleExpand,
}: {
  variants: VariantInventory[];
  loading: boolean;
  error?: string;
  edits: Record<string, string>;
  expanded: Set<string>;
  onEdit: (key: string, val: string) => void;
  onToggleExpand: (id: string) => void;
}) {
  if (loading) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
        Loading inventory…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "10px 0", color: "#991b1b", fontSize: 13 }}>{error}</div>
    );
  }

  const trackedVariants = variants.filter((v) => v.inventoryItemId);

  if (trackedVariants.length === 0) {
    return (
      <div style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, color: "#6b7280" }}>
        Inventory not managed by Shopify — quantities cannot be updated.
      </div>
    );
  }

  const isSimple = trackedVariants.length === 1 && (trackedVariants[0].title === "Default Title" || variants.length === 1);

  if (isSimple) {
    const variant = trackedVariants[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {variant.locations.length === 0 && (
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>No locations found.</p>
        )}
        {variant.locations.map((loc) => {
          const key = `${variant.inventoryItemId}__${loc.locationId}`;
          return (
            <div key={loc.locationId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{loc.locationName}</span>
              <input
                type="number"
                min="0"
                value={edits[key] ?? ""}
                onChange={(e) => onEdit(key, e.target.value)}
                placeholder="0"
                style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, textAlign: "right" }}
                aria-label={`Quantity at ${loc.locationName}`}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Multi-variant: collapsible
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {trackedVariants.map((variant) => {
        const isOpen = expanded.has(variant.id);
        return (
          <div key={variant.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => onToggleExpand(variant.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: isOpen ? "#f3f4f6" : "#f9fafb", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{variant.title}</span>
                {variant.sku && (
                  <span style={{ fontSize: 11, color: "#9ca3af", background: "#e5e7eb", borderRadius: 4, padding: "1px 6px" }}>
                    {variant.sku}
                  </span>
                )}
              </div>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"
                style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", flexShrink: 0 }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: 6, background: "#fff" }}>
                {variant.locations.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>No locations found.</p>
                )}
                {variant.locations.map((loc) => {
                  const key = `${variant.inventoryItemId}__${loc.locationId}`;
                  return (
                    <div key={loc.locationId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{loc.locationName}</span>
                      <input
                        type="number"
                        min="0"
                        value={edits[key] ?? ""}
                        onChange={(e) => onEdit(key, e.target.value)}
                        placeholder="0"
                        style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, textAlign: "right" }}
                        aria-label={`Quantity at ${loc.locationName}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function ProductsPage() {
  const loaderData = useLoaderData<typeof loader>() as any;
  const { shop, plan, maxProducts, trackedCount, threshold, products, pageInfo, search, filter, after, prev, syncRunning, lastSyncCompletedAt, lastSyncCount, autoHideEnabled, autoRepublishEnabled } = loaderData;

  const nav = useNavigation();
  const submit = useSubmit();
  const saveFetcher = useFetcher<typeof action>();
  const inventoryFetcher = useFetcher<{ inventoryData?: { variants: VariantInventory[] } | null; inventoryError?: string }>();

  const busy = nav.state === "submitting";

  const { syncPct, syncStreamError, clearError, openStream } = useSyncStream(shop, syncRunning);

  const actionData = useActionData<typeof action>();
  useEffect(() => {
    if ((actionData as any)?.status === "started") openStream();
  }, [actionData, openStream]);

  const enableTrackingFetcher = useFetcher<{ status?: string; error?: string }>();
  const settingsFetcher = useFetcher<{ productSettings?: ProductSettings | null; settingsError?: string }>();

  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editTracked, setEditTracked] = useState(false);
  const [editMonitoring, setEditMonitoring] = useState(false);
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());
  const [inventoryEdits, setInventoryEdits] = useState<Record<string, string>>({});
  const [editCustomThreshold, setEditCustomThreshold] = useState("");
  const [editAutoHide, setEditAutoHide] = useState(false);
  const [editAutoRepublish, setEditAutoRepublish] = useState(false);
  const [customThresholdMetafieldId, setCustomThresholdMetafieldId] = useState<string | null>(null);

  // Initial inventory fetch when modal opens for an already-tracked product
  useEffect(() => {
    if (!editProduct || !editTracked) return;
    inventoryFetcher.load(`/app/products?intent=get_product_inventory&productId=${editProduct.productId}`);
    setExpandedVariants(new Set());
    setInventoryEdits({});
  }, [editProduct?.productId]);

  // Load per-product metafield settings whenever modal opens
  useEffect(() => {
    if (!editProduct) return;
    settingsFetcher.load(`/app/products?intent=get_product_settings&productId=${editProduct.productId}`);
    setEditCustomThreshold("");
    setEditAutoHide(autoHideEnabled);
    setEditAutoRepublish(autoRepublishEnabled);
    setCustomThresholdMetafieldId(null);
  }, [editProduct?.productId]);

  // Populate settings state when metafield data arrives
  useEffect(() => {
    const s = settingsFetcher.data?.productSettings;
    if (!s) return;
    setEditCustomThreshold(s.customThreshold ?? "");
    setEditAutoHide(s.autoHide !== null ? s.autoHide : autoHideEnabled);
    setEditAutoRepublish(s.autoRepublish !== null ? s.autoRepublish : autoRepublishEnabled);
    setCustomThresholdMetafieldId(s.customThresholdId);
  }, [settingsFetcher.data]);

  // Close modal on successful save
  useEffect(() => {
    if (saveFetcher.state === "idle" && saveFetcher.data && "success" in saveFetcher.data) {
      setEditProduct(null);
    }
  }, [saveFetcher.state, saveFetcher.data]);

  // Initialise edits when inventory data arrives (from either enable or plain fetch)
  const latestInventoryVariants =
    enableTrackingFetcher.data && "enabledInventory" in enableTrackingFetcher.data
      ? (enableTrackingFetcher.data as any).enabledInventory.variants
      : inventoryFetcher.data?.inventoryData?.variants ?? [];

  useEffect(() => {
    if (!latestInventoryVariants.length) return;
    const initial: Record<string, string> = {};
    for (const v of latestInventoryVariants) {
      if (!v.inventoryItemId) continue;
      for (const loc of v.locations) {
        initial[`${v.inventoryItemId}__${loc.locationId}`] = String(loc.quantity);
      }
    }
    setInventoryEdits(initial);
  }, [latestInventoryVariants]);

  const openEdit = (p: ProductRow) => {
    setEditProduct(p);
    setEditStatus(p.shopifyStatus ?? "ACTIVE");
    setEditTracked(p.isTracked);
    setEditMonitoring(p.monitoringEnabled);
  };

  const buildUrl = (params: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (filter !== "all") p.set("filter", filter);
    if (prev) p.set("prev", prev); // preserved by default; callers can override with null to clear
    Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    const qs = p.toString();
    return `/app/products${qs ? `?${qs}` : ""}`;
  };

  // Compute prev/next cursor values for pagination links
  const prevList = prev ? prev.split(",") : [];
  const prevPageAfter = prevList[prevList.length - 1] ?? null;
  const prevPagePrev = prevList.slice(0, -1).join(",") || null;
  const nextPagePrev = [prev, after].filter(Boolean).join(",") || null;

  const toggleVariant = (id: string) => {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saving = saveFetcher.state === "submitting";
  const loadingInventory = enableTrackingFetcher.state === "submitting" || inventoryFetcher.state === "loading";

  // Build inventory updates array for form submission
  const inventoryUpdates = Object.entries(inventoryEdits)
    .map(([key, val]) => {
      const parts = key.split("__");
      if (parts.length !== 2) return null;
      const parsed = parseInt(val);
      const quantity = isNaN(parsed) || val.trim() === "" ? 0 : Math.max(0, parsed);
      return { inventoryItemId: parts[0], locationId: parts[1], quantity };
    })
    .filter(Boolean) as Array<{ inventoryItemId: string; locationId: string; quantity: number }>;

  const inventoryVariants = latestInventoryVariants;

  return (
    <s-page heading="Products" sub-heading={`${trackedCount} of ${maxProducts} products tracked · ${plan === "pro" ? "Professional" : "Basic"} plan`}>
      <SyncButton
        slot="primary-action"
        pct={syncPct}
        onClick={() => { if (syncPct === null && !busy) { clearError(); submit({ intent: "sync" }, { method: "post" }); } }}
      />

      {actionData && "error" in actionData && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#991b1b" }}>
          {actionData.error}
        </div>
      )}
      {actionData && "message" in actionData && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#065f46" }}>
          {actionData.message}
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

      {plan !== "pro" && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
          Basic plan: monitoring up to {maxProducts} products.{" "}
          <a href="/app/billing" style={{ color: "#1d4ed8", fontWeight: 600 }}>Upgrade to Pro →</a>
        </div>
      )}

      {lastSyncCompletedAt && (
        <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>
          Last synced {timeAgo(lastSyncCompletedAt)}{lastSyncCount !== null ? ` · ${lastSyncCount} products` : ""}
        </div>
      )}

      <s-section heading="">
        {/* Search */}
        <Form method="get" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input type="hidden" name="filter" value={filter} />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by title…"
            style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }}
            aria-label="Search products"
          />
          <button type="submit" style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
            Search
          </button>
          {search && (
            <Link to={`/app/products${filter !== "all" ? `?filter=${filter}` : ""}`}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", textDecoration: "none", fontSize: 14, color: "#374151", lineHeight: "1.5" }}>
              Clear
            </Link>
          )}
        </Form>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.key}
              to={buildUrl({ filter: tab.key === "all" ? null : tab.key, after: null, prev: null })}
              style={{
                padding: "6px 14px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap",
                fontWeight: filter === tab.key || (tab.key === "all" && filter === "all") ? 600 : 400,
                color: filter === tab.key || (tab.key === "all" && filter === "all") ? "#111827" : "#6b7280",
                borderBottom: filter === tab.key || (tab.key === "all" && filter === "all") ? "2px solid #111827" : "2px solid transparent",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>No products found.</p>
            <p style={{ fontSize: 14 }}>
              {filter === "not_tracked"
                ? "All products have been synced and are tracked."
                : "Click Sync Products to import your Shopify inventory."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Product", "SKU", "Quantity", "Status", "Monitor Alert", "Action"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p: ProductRow) => {
                  const s = STATUS_STYLE[p.inventoryStatus ?? "not_tracked"] ?? STATUS_STYLE.not_tracked;
                  const isNotTracked = p.inventoryStatus === "not_tracked";
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6", opacity: isNotTracked ? 0.8 : 1 }}>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.imageAlt} width={40} height={40}
                              style={{ borderRadius: 6, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 40, height: 40, borderRadius: 6, background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 18 }}>
                              ▢
                            </div>
                          )}
                          <span style={{ fontWeight: 500 }}>{p.productTitle ?? "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{p.sku ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: isNotTracked ? "#9ca3af" : p.currentQuantity <= 0 ? "#dc2626" : p.currentQuantity <= 5 ? "#d97706" : "#059669" }}>
                        {isNotTracked ? "—" : p.currentQuantity}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          background: p.monitoringEnabled ? "#d1fae5" : "#f3f4f6",
                          color: p.monitoringEnabled ? "#065f46" : "#6b7280",
                          padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500,
                        }}>
                          {p.monitoringEnabled ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <button
                          onClick={() => openEdit(p)}
                          title="Edit product"
                          style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#374151", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            {after ? `Page ${prevList.length + 2}` : "Page 1"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {prevList.length > 1 && (
              <Link
                to={buildUrl({ after: null, prev: null })}
                style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
              >
                ← First
              </Link>
            )}
            {after && (
              <Link
                to={buildUrl({ after: prevPageAfter, prev: prevPagePrev })}
                style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
              >
                ← Previous
              </Link>
            )}
            {pageInfo.hasNextPage && pageInfo.endCursor && (
              <Link
                to={buildUrl({ after: pageInfo.endCursor, prev: nextPagePrev })}
                style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      </s-section>

      {/* Edit modal */}
      {editProduct && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditProduct(null); }}
        >
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>

            {/* Modal header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
              {editProduct.imageUrl ? (
                <img src={editProduct.imageUrl} alt={editProduct.imageAlt} width={52} height={52}
                  style={{ borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 52, height: 52, borderRadius: 8, background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 22 }}>
                  ▢
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {editProduct.productTitle}
                </p>
                {editProduct.sku && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>SKU: {editProduct.sku}</p>}
              </div>
              <button onClick={() => setEditProduct(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {/* Fetcher error */}
              {saveFetcher.data && "error" in saveFetcher.data && (
                <div style={{ margin: "12px 24px 0", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", color: "#991b1b", fontSize: 13 }}>
                  {saveFetcher.data.error}
                </div>
              )}

              <saveFetcher.Form method="post" style={{ padding: "20px 24px 24px" }}>
                <input type="hidden" name="intent" value="update_product" />
                <input type="hidden" name="productId" value={editProduct.productId} />
                <input type="hidden" name="productTitle" value={editProduct.productTitle ?? ""} />
                <input type="hidden" name="inventoryUpdates" value={JSON.stringify(inventoryUpdates)} />
                <input type="hidden" name="shopifyInventoryItemId" value={inventoryVariants[0]?.inventoryItemId ?? ""} />

                {/* Shopify status */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>
                    Product Status
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {SHOPIFY_STATUSES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setEditStatus(s.value)}
                        style={{
                          flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                          border: editStatus === s.value ? "2px solid #111827" : "1px solid #e5e7eb",
                          background: editStatus === s.value ? "#111827" : "#fff",
                          color: editStatus === s.value ? "#fff" : "#374151",
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <input type="hidden" name="shopifyStatus" value={editStatus} />
                </div>

                {/* Shopify Tracking toggle */}
                <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Shopify Tracking</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: editTracked ? "#059669" : "#9ca3af" }}>
                        {editTracked ? "Shopify is tracking inventory for this product." : "Shopify is not tracking inventory."}
                      </p>
                    </div>
                    <div
                      onClick={() => {
                        const next = !editTracked;
                        setEditTracked(next);
                        if (!next) setEditMonitoring(false);
                        if (next && editProduct) {
                          setExpandedVariants(new Set());
                          setInventoryEdits({});
                          enableTrackingFetcher.submit(
                            { intent: "enable_and_fetch_inventory", productId: editProduct.productId },
                            { method: "post" }
                          );
                        }
                      }}
                      style={{
                        width: 44, height: 24, borderRadius: 12, background: editTracked ? "#008060" : "#d1d5db",
                        position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer",
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 2, left: editTracked ? 22 : 2,
                        width: 20, height: 20, borderRadius: "50%", background: "#fff",
                        transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </div>
                  </label>
                  <input type="hidden" name="tracked" value={String(editTracked)} />
                </div>

                {/* Monitoring toggle — only active when Shopify Tracking is on */}
                <div style={{ marginBottom: editTracked ? 16 : 24, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb", opacity: editTracked ? 1 : 0.45 }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: editTracked ? "pointer" : "not-allowed" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Monitoring</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: editMonitoring && editTracked ? "#059669" : "#9ca3af" }}>
                        {!editTracked ? "Enable Shopify Tracking first." : editMonitoring ? "Active — Stock Alert will send alerts for this product." : "Inactive — no alerts will be sent."}
                      </p>
                    </div>
                    <div
                      onClick={() => { if (editTracked) setEditMonitoring(!editMonitoring); }}
                      style={{
                        width: 44, height: 24, borderRadius: 12, background: editMonitoring && editTracked ? "#008060" : "#d1d5db",
                        position: "relative", flexShrink: 0, transition: "background .2s", cursor: editTracked ? "pointer" : "not-allowed",
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 2, left: editMonitoring && editTracked ? 22 : 2,
                        width: 20, height: 20, borderRadius: "50%", background: "#fff",
                        transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </div>
                  </label>
                  <input type="hidden" name="monitoringEnabled" value={String(editMonitoring && editTracked)} />
                </div>

                {/* Inventory settings — only shown when tracking is enabled */}
                {editTracked && (
                  <div style={{ marginBottom: 16, padding: "14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                    <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 13, color: "#374151" }}>
                      Inventory Settings
                    </p>

                    {/* Auto-hide sold-out products */}
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>Auto-hide sold-out products</p>
                          <p style={{ margin: "1px 0 0", fontSize: 12, color: "#9ca3af" }}>Automatically unpublish when stock hits zero</p>
                        </div>
                        <div
                          onClick={() => setEditAutoHide((v) => !v)}
                          style={{
                            width: 36, height: 20, borderRadius: 10, background: editAutoHide ? "#008060" : "#d1d5db",
                            position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer", marginLeft: 12,
                          }}
                        >
                          <div style={{
                            position: "absolute", top: 2, left: editAutoHide ? 18 : 2,
                            width: 16, height: 16, borderRadius: "50%", background: "#fff",
                            transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </div>
                      </label>
                      <input type="hidden" name="autoHide" value={String(editAutoHide)} />
                    </div>

                    {/* Auto-republish when restocked */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>Auto-republish when restocked</p>
                          <p style={{ margin: "1px 0 0", fontSize: 12, color: "#9ca3af" }}>Republish automatically when inventory is added</p>
                        </div>
                        <div
                          onClick={() => setEditAutoRepublish((v) => !v)}
                          style={{
                            width: 36, height: 20, borderRadius: 10, background: editAutoRepublish ? "#008060" : "#d1d5db",
                            position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer", marginLeft: 12,
                          }}
                        >
                          <div style={{
                            position: "absolute", top: 2, left: editAutoRepublish ? 18 : 2,
                            width: 16, height: 16, borderRadius: "50%", background: "#fff",
                            transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                          }} />
                        </div>
                      </label>
                      <input type="hidden" name="autoRepublish" value={String(editAutoRepublish)} />
                    </div>

                    {/* Low-stock threshold */}
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>
                        Low-Stock Threshold
                        {plan !== "pro" && (
                          <span style={{ marginLeft: 6, fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4 }}>
                            Pro only
                          </span>
                        )}
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="number"
                          min="0"
                          value={editCustomThreshold}
                          onChange={(e) => setEditCustomThreshold(e.target.value)}
                          placeholder={`Store default (${threshold})`}
                          disabled={plan !== "pro"}
                          style={{
                            width: 150, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 10px", fontSize: 13,
                            background: plan !== "pro" ? "#f3f4f6" : "#fff",
                            color: plan !== "pro" ? "#9ca3af" : "#111827",
                            cursor: plan !== "pro" ? "not-allowed" : "text",
                          }}
                          aria-label="Custom threshold"
                        />
                        {editCustomThreshold && plan === "pro" && (
                          <button type="button" onClick={() => setEditCustomThreshold("")}
                            style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                            Reset to default
                          </button>
                        )}
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>Alert when inventory falls below this amount</p>
                      <input type="hidden" name="customThreshold" value={editCustomThreshold} />
                      <input type="hidden" name="customThresholdMetafieldId" value={customThresholdMetafieldId ?? ""} />
                    </div>
                  </div>
                )}

                {/* Inventory section — only shown when tracking is enabled */}
                {editTracked && (
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>
                      Inventory
                    </label>
                    <InventorySection
                      variants={inventoryVariants}
                      loading={loadingInventory}
                      error={inventoryFetcher.data?.inventoryError}
                      edits={inventoryEdits}
                      expanded={expandedVariants}
                      onEdit={(key, val) => setInventoryEdits((prev) => ({ ...prev, [key]: val }))}
                      onToggleExpand={toggleVariant}
                    />
                    {!loadingInventory && inventoryVariants.some((v: VariantInventory) => v.tracked) && (
                      <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9ca3af" }}>
                        Updates available quantity at each Shopify location.
                      </p>
                    )}
                  </div>
                )}

                {/* Footer buttons */}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setEditProduct(null)} disabled={saving}
                    style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}
                    style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: saving ? "#9ca3af" : "#111827", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </saveFetcher.Form>
            </div>
          </div>
        </div>
      )}
    </s-page>
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

function SyncButton({ pct, onClick, slot }: { pct: number | null; onClick: () => void; slot?: Lowercase<string> }) {
  const syncing = pct !== null;
  const displayPct = Math.round(pct ?? 0);
  return (
    <s-button
      slot={slot}
      variant="primary"
      disabled={syncing ? true : undefined}
      onClick={!syncing ? onClick : undefined}
    >
      {syncing ? `Syncing ${displayPct}%` : "Sync Products"}
    </s-button>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
