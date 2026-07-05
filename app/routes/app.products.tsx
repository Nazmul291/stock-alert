import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, Link, useNavigation, useSubmit, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { useSSEData } from "../hooks/use-sse-data";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMaxProducts } from "../lib/plan-limits";
import { enforcePlanLimits } from "../lib/plan-enforcement";
import { syncState } from "../lib/sync-state.server";
import { PRODUCT_METAFIELDS_QUERY } from "../lib/graphql";
import { calcSalesVelocity, computeStockOutDays } from "../lib/velocity.server";
import { ProductEditModal } from "../components/ProductEditModal";
import type { ProductRow } from "../components/ProductEditModal";
import type { VariantInventory, LocationInventory } from "../components/InventorySection";
import { SkeletonBlock, SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { ProductsData } from "../lib/products-data.server";

const SYNC_PRODUCTS_GRAPHQL = `
  query getProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      edges {
        node {
          id title status
          featuredMedia { preview { image { url altText } } }
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
    const statusFilter: string[] =
      csvFilter === "out_of_stock" ? ["out_of_stock"]
      : csvFilter === "low_stock"  ? ["low_stock"]
      : csvFilter === "in_stock"   ? ["in_stock"]
      : ["in_stock", "low_stock", "out_of_stock"];

    const rows = await prisma.inventoryTracking.findMany({
      where: { shop, inventoryStatus: { in: statusFilter as any }, monitoringEnabled: true },
      orderBy: [{ inventoryStatus: "asc" }, { currentQuantity: "asc" }],
      select: {
        productId: true, productTitle: true, sku: true,
        currentQuantity: true, inventoryStatus: true,
        stockOutDays: true, avgDailySales: true,
        lastAlertType: true, lastAlertSentAt: true,
      },
    });

    const header = ["Product Title", "SKU", "Quantity", "Status", "Days Left", "Avg Daily Sales", "Last Alert", "Last Alert Date"];
    const escape = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      header.join(","),
      ...rows.map((r) => [
        escape(r.productTitle),
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
      const json: any = await res.json();
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
      const json: any = await res.json();

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
      const res = await admin.graphql(PRODUCT_METAFIELDS_QUERY, {
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
  admin: any; shop: string; plan: string; maxProducts: number; threshold: number;
  monitoringFilter?: string; monitoringCollectionId?: string | null; monitoringTags?: string | null;
}) {
  let allProducts: any[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;

  try {
    while (hasNextPage && allProducts.length < maxProducts) {
      const batchSize = Math.min(250, maxProducts - allProducts.length);
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
      const gqlJson: any = await gqlResponse.json();

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

        allProducts.push({
          productId: BigInt(productId),
          productTitle: p.title,
          sku: skus.join(", ") || null,
          currentQuantity: totalQty,
          inventoryStatus: status,
          imageUrl: p.featuredMedia?.preview?.image?.url ?? null,
          imageAlt: p.featuredMedia?.preview?.image?.altText ?? null,
        });
      }

      hasNextPage = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;

      const fetchPct = Math.min(80, 5 + Math.round((allProducts.length / maxProducts) * 75));
      await syncState.progress(shop, fetchPct);
    }

    await syncState.progress(shop, 82);
    const CHUNK = 100;
    const now = new Date();
    for (let i = 0; i < allProducts.length; i += CHUNK) {
      const chunk = allProducts.slice(i, i + CHUNK);
      await prisma.$transaction(
        chunk.map((p) =>
          prisma.inventoryTracking.upsert({
            where: { shop_productId: { shop, productId: p.productId } },
            update: { productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus, imageUrl: p.imageUrl, imageAlt: p.imageAlt, lastCheckedAt: now },
            create: { shop, productId: p.productId, productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, previousQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus, imageUrl: p.imageUrl, imageAlt: p.imageAlt },
          }),
        ),
      );
      const dbPct = 82 + Math.round(((i + chunk.length) / allProducts.length) * 16);
      await syncState.progress(shop, dbPct);
    }

    if (allProducts.length > 0) {
      const syncedIds = allProducts.map((p) => p.productId);
      const { count: pruned } = await prisma.inventoryTracking.deleteMany({
        where: { shop, productId: { notIn: syncedIds } },
      });
      if (pruned > 0) {
        console.log(`[Sync] Pruned ${pruned} stale tracking row(s) for ${shop}`);
      }
    }

    // Velocity calculation — query last 30 days of orders to compute avg daily sales
    try {
      await syncState.progress(shop, 99);
      const velocity = await calcSalesVelocity(admin);
      const velUpdates: Array<{ productId: bigint; avgDailySales: number; stockOutDays: number | null }> = [];
      for (const p of allProducts) {
        const avg = velocity.get(p.productId.toString()) ?? 0;
        if (avg > 0) {
          velUpdates.push({
            productId: p.productId,
            avgDailySales: avg,
            stockOutDays: computeStockOutDays(p.currentQuantity, avg),
          });
        }
      }
      if (velUpdates.length > 0) {
        await prisma.$transaction(
          velUpdates.map((v) =>
            prisma.inventoryTracking.updateMany({
              where: { shop, productId: v.productId },
              data: { avgDailySales: v.avgDailySales, stockOutDays: v.stockOutDays },
            }),
          ),
        );
        console.log(`[Sync] Velocity updated for ${velUpdates.length} product(s) in ${shop}`);
      }
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
        const json: any = await res.json();
        const errs = json.data?.inventoryItemUpdate?.userErrors ?? [];
        if (errs.length > 0) errors.push(errs.map((e: any) => e.message).join(", "));
      } catch (err) {
        errors.push(`Inventory tracking enable failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    try {
      const res = await admin.graphql(PRODUCT_UPDATE_MUTATION, {
        variables: { product: { id: `gid://shopify/Product/${productId}`, status: shopifyStatus } },
      });
      const json: any = await res.json();
      const errs = json.data?.productUpdate?.userErrors ?? [];
      if (errs.length > 0) errors.push(errs.map((e: any) => e.message).join(", "));
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
        const invJson: any = await invRes.json();
        const invErrs = invJson.data?.inventorySetQuantities?.userErrors ?? [];
        if (invErrs.length > 0) errors.push(invErrs.map((e: any) => e.message).join(", "));
      } catch (err) {
        errors.push(`Quantity update failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;
    const existing = await prisma.inventoryTracking.findUnique({
      where: { shop_productId: { shop, productId: BigInt(productId) } },
    });

    const rawManualSales = ((form.get("manualDailySales") as string) ?? "").trim();
    const manualDailySales = rawManualSales !== "" && !isNaN(parseFloat(rawManualSales)) ? parseFloat(rawManualSales) : null;
    const rawRestockDate = ((form.get("expectedRestockDate") as string) ?? "").trim();
    const expectedRestockDate = rawRestockDate ? new Date(rawRestockDate) : null;

    if (tracked) {
      const totalQty = inventoryUpdates.reduce((sum, u) => sum + u.quantity, 0);
      const qty = inventoryUpdates.length > 0 ? totalQty : (existing?.currentQuantity ?? 0);
      const invStatus: "in_stock" | "low_stock" | "out_of_stock" =
        qty <= 0 ? "out_of_stock" : qty <= threshold ? "low_stock" : "in_stock";
      const effectiveSales = manualDailySales ?? existing?.avgDailySales ?? null;
      const stockOutDays = effectiveSales ? Math.min(999, Math.ceil(qty / effectiveSales)) : undefined;
      if (existing) {
        await prisma.inventoryTracking.update({
          where: { id: existing.id },
          data: {
            ...(inventoryUpdates.length > 0 ? { currentQuantity: qty, inventoryStatus: invStatus } : {}),
            monitoringEnabled,
            lastCheckedAt: new Date(),
            manualDailySales,
            expectedRestockDate,
            ...(stockOutDays !== undefined ? { stockOutDays } : {}),
          },
        });
      } else {
        await prisma.inventoryTracking.create({
          data: { shop, productId: BigInt(productId), productTitle, currentQuantity: qty, previousQuantity: 0, inventoryStatus: invStatus, monitoringEnabled, manualDailySales, expectedRestockDate },
        });
      }
    } else if (existing) {
      await prisma.inventoryTracking.deleteMany({ where: { shop, productId: BigInt(productId) } });
    }

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
      const invJson: any = await invRes.json();
      const edges = invJson.data?.product?.variants?.edges ?? [];

      for (const edge of edges) {
        const itemId = edge.node.inventoryItem?.id;
        if (itemId && !edge.node.inventoryItem.tracked) {
          await admin.graphql(INVENTORY_ITEM_UPDATE_MUTATION, {
            variables: { id: itemId, input: { tracked: true } },
          });
        }
      }

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

  if (intent === "bulk_monitoring") {
    const productIds = JSON.parse((form.get("productIds") as string) ?? "[]") as string[];
    const enabled = form.get("monitoringEnabled") === "true";
    if (productIds.length > 0) {
      await prisma.inventoryTracking.updateMany({
        where: { shop, productId: { in: productIds.map(BigInt) } },
        data: { monitoringEnabled: enabled },
      });
    }
    return { success: true, message: `Monitoring ${enabled ? "enabled" : "disabled"} for ${productIds.length} product(s).` };
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

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  in_stock: { bg: "#d1fae5", color: "#065f46", label: "In Stock" },
  low_stock: { bg: "#fef3c7", color: "#92400e", label: "Low Stock" },
  out_of_stock: { bg: "#fee2e2", color: "#991b1b", label: "Out of Stock" },
  deactivated: { bg: "#f3f4f6", color: "#374151", label: "Deactivated" },
  not_tracked: { bg: "#ede9fe", color: "#5b21b6", label: "Not Tracked" },
};

const FILTER_TABS = [
  { key: "all",           label: "All Products" },
  { key: "out_of_stock",  label: "Out of Stock" },
  { key: "low_stock",     label: "Low Stock" },
  { key: "tracked",       label: "Tracked" },
  { key: "not_tracked",   label: "Not Tracked" },
];

export default function ProductsPage() {
  const { search, filter, after, prev, token } = useLoaderData<typeof loader>() as any;
  const { data, error, retry } = useSSEData<ProductsData>(
    `/api/products-stream?token=${encodeURIComponent(token)}&search=${encodeURIComponent(search)}&filter=${encodeURIComponent(filter)}${after ? `&after=${encodeURIComponent(after)}` : ""}`,
  );

  return (
    <s-page heading="Products" sub-heading="Monitor and manage your tracked inventory">
      {error ? (
        <SSEErrorRetry message={error} onRetry={retry} />
      ) : data ? (
        <ProductsPageContent data={data} search={search} filter={filter} after={after} prev={prev} />
      ) : (
        <ProductsPageSkeleton />
      )}
    </s-page>
  );
}

function ProductsPageContent({ data, search, filter, after, prev }: {
  data: ProductsData;
  search: string;
  filter: string;
  after: string | null;
  prev: string;
}) {
  const { shop, plan, maxProducts, trackedCount, threshold, products, pageInfo, syncRunning, lastSyncCompletedAt, lastSyncCount, autoHideEnabled, autoRepublishEnabled, supplierLeadTimeDays } = data;

  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state === "submitting";

  const { syncPct, syncStreamError, clearError, openStream } = useSyncStream(shop, syncRunning);

  const actionData = useActionData<typeof action>();
  useEffect(() => {
    if ((actionData as any)?.status === "started") openStream();
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

  const toggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  const selectableIds = (products as ProductRow[]).filter((p) => p.isTracked).map((p) => p.productId);
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

  const buildUrl = (params: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (filter !== "all") p.set("filter", filter);
    if (prev) p.set("prev", prev);
    Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    const qs = p.toString();
    return `/app/products${qs ? `?${qs}` : ""}`;
  };

  const prevList = prev ? prev.split(",") : [];
  const prevPageAfter = prevList[prevList.length - 1] ?? null;
  const prevPagePrev = prevList.slice(0, -1).join(",") || null;
  const nextPagePrev = [prev, after].filter(Boolean).join(",") || null;

  return (
    <>
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
      {(actionData && "message" in actionData || bulkFetcher.data && "message" in bulkFetcher.data) && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#065f46" }}>
          {(bulkFetcher.data as any)?.message ?? (actionData as any)?.message}
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
          Basic plan: monitoring up to {maxProducts} products. {trackedCount} of {maxProducts} tracked.{" "}
          <s-link href="/app/billing">Upgrade to Pro →</s-link>
        </div>
      )}

      {lastSyncCompletedAt && (
        <div style={{ fontSize: 13, color: "#9ca3af", marginBottom: 12 }}>
          Last synced {timeAgo(lastSyncCompletedAt)}{lastSyncCount !== null ? ` · ${lastSyncCount} products` : ""}
        </div>
      )}

      <s-section heading="">
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

        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 0 }}>
          <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", flex: 1 }}>
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
          <button
            onClick={() => csvFetcher.load(`/app/products?intent=export_csv${filter !== "all" ? `&filter=${filter}` : ""}`)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 6, border: "1px solid #d1d5db",
              background: "#fff", color: "#374151", fontSize: 13, cursor: "pointer",
              whiteSpace: "nowrap", marginBottom: 1,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export CSV
          </button>
        </div>
        <div style={{ marginBottom: 16 }} />

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
                  <th style={{ padding: "8px 8px 8px 12px", width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      disabled={selectableIds.length === 0}
                      aria-label="Select all"
                      style={{ cursor: selectableIds.length === 0 ? "not-allowed" : "pointer" }}
                    />
                  </th>
                  {[
                    { label: "Product" },
                    { label: "SKU" },
                    { label: "Quantity" },
                    { label: "Status", width: 130 },
                    { label: "Days Left" },
                    { label: "Reorder By" },
                    { label: "Monitor Alert" },
                    { label: "Action" },
                  ].map(({ label, width }) => (
                    <th key={label} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap", ...(width ? { width, minWidth: width } : {}) }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p: ProductRow) => {
                  const s = STATUS_STYLE[p.inventoryStatus ?? "not_tracked"] ?? STATUS_STYLE.not_tracked;
                  const isNotTracked = p.inventoryStatus === "not_tracked";
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6", opacity: isNotTracked ? 0.8 : 1 }}>
                      <td style={{ padding: "10px 8px 10px 12px", width: 32 }}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.productId)}
                          onChange={() => toggleSelect(p.productId)}
                          disabled={!p.isTracked}
                          aria-label={`Select ${p.productTitle}`}
                          style={{ cursor: p.isTracked ? "pointer" : "not-allowed" }}
                        />
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.imageAlt} width={40} height={40} loading="lazy"
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
                      <td style={{ padding: "10px 12px", width: 130, minWidth: 130 }}>
                        <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <StockOutBadge days={p.isTracked ? (p.stockOutDays ?? null) : null} isManual={!!p.manualDailySales} />
                        {p.expectedRestockDate && (
                          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                            Back: {new Date(p.expectedRestockDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <ReorderBadge days={p.isTracked ? (p.stockOutDays ?? null) : null} leadTime={supplierLeadTimeDays ?? 7} />
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
                          onClick={() => setEditProduct(p)}
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

        {selectedIds.size > 0 && (
          <div style={{ position: "sticky", bottom: 16, zIndex: 50, margin: "12px 0 0", background: "#111827", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}>
            <span style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 500, flex: 1 }}>
              {selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={() => submitBulk(true)}
              disabled={bulkFetcher.state === "submitting"}
              style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              Enable Monitoring
            </button>
            <button
              type="button"
              onClick={() => submitBulk(false)}
              disabled={bulkFetcher.state === "submitting"}
              style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              Disable Monitoring
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid #4b5563", background: "transparent", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}
            >
              Clear
            </button>
          </div>
        )}

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

      {editProduct && (
        <ProductEditModal
          product={editProduct}
          plan={plan}
          threshold={threshold}
          autoHideEnabled={autoHideEnabled}
          autoRepublishEnabled={autoRepublishEnabled}
          onClose={() => setEditProduct(null)}
        />
      )}
    </>
  );
}

function ProductsPageSkeleton() {
  return (
    <>
      <s-button slot="primary-action" disabled>Sync Products</s-button>
      <s-section heading="">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <SkeletonBlock width="100%" height={32} borderRadius={6} />
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          {Array.from({ length: 5 }, (_, i) => <SkeletonBlock key={i} width={90} height={20} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonBlock key={i} width="100%" height={56} borderRadius={6} />
          ))}
        </div>
      </s-section>
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

function ReorderBadge({ days, leadTime }: { days: number | null; leadTime: number }) {
  if (days === null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  if (days === 0) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;

  const daysUntilReorder = days - leadTime;

  if (daysUntilReorder <= 0) {
    return (
      <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
        Reorder now!
      </span>
    );
  }

  const reorderDate = new Date();
  reorderDate.setDate(reorderDate.getDate() + daysUntilReorder);
  const label = reorderDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isUrgent = daysUntilReorder <= 3;

  return (
    <span style={{
      background: isUrgent ? "#fef3c7" : "#f9fafb",
      color: isUrgent ? "#92400e" : "#374151",
      border: `1px solid ${isUrgent ? "#fde68a" : "#e5e7eb"}`,
      padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: isUrgent ? 600 : 400,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function StockOutBadge({ days, isManual }: { days: number | null; isManual?: boolean }) {
  if (days === null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  if (days === 0) return (
    <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      Out of stock
    </span>
  );
  const bg    = days < 7  ? "#fee2e2" : days < 14 ? "#fef3c7" : "#d1fae5";
  const color = days < 7  ? "#991b1b" : days < 14 ? "#92400e" : "#065f46";
  return (
    <span style={{ background: bg, color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
      title={isManual ? "Based on manual daily sales rate" : "Based on 30-day sales average"}>
      ~{days}d{isManual ? " ✎" : ""}
    </span>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
