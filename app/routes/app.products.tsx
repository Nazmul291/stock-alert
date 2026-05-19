import { useState, useEffect, useRef } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation, useSubmit, useFetcher, useRevalidator } from "react-router";
import type { ReactNode } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMaxProducts } from "../lib/plan-limits";
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

  const search = url.searchParams.get("search") ?? "";
  const after = url.searchParams.get("after") ?? null;
  const filter = url.searchParams.get("filter") ?? "all";
  const pageSize = 50;

  const [storeSession, settings] = await Promise.all([
    prisma.session.findFirst({ where: { shop, isOnline: false } }),
    prisma.storeSettings.findUnique({ where: { shop } }),
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
    prisma.inventoryTracking.count({ where: { shop } }),
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

  return { shop, plan, maxProducts, trackedCount, threshold, products, pageInfo, search, filter, after, syncRunning: syncState.get(shop)?.running ?? false };
};

async function runProductSync({ admin, shop, maxProducts, threshold }: {
  admin: any; shop: string; maxProducts: number; threshold: number;
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
      syncState.progress(shop, fetchPct);
    }

    // Phase 2: Write to database (80% → 98%)
    syncState.progress(shop, 82);
    for (let i = 0; i < allProducts.length; i++) {
      const p = allProducts[i];
      await prisma.inventoryTracking.upsert({
        where: { shop_productId: { shop, productId: p.productId } },
        update: { productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus, lastCheckedAt: new Date() },
        create: { shop, productId: p.productId, productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, previousQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus },
      });
      // Report DB write progress every 10 products
      if (i % 10 === 0) {
        const dbPct = 82 + Math.round((i / allProducts.length) * 16);
        syncState.progress(shop, dbPct);
      }
    }

    await prisma.setupProgress.upsert({
      where: { shop },
      update: { firstProductTracked: true, productThresholdsConfigured: true },
      create: { shop, appInstalled: true, firstProductTracked: true, productThresholdsConfigured: true, globalSettingsConfigured: false, notificationsConfigured: false },
    });

    syncState.done(shop, allProducts.length);
  } catch (err) {
    syncState.fail(shop, err instanceof Error ? err.message : "Unknown error");
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
          data: { ...(inventoryUpdates.length > 0 ? { currentQuantity: qty, inventoryStatus: invStatus } : {}), lastCheckedAt: new Date() },
        });
      } else {
        await prisma.inventoryTracking.create({
          data: { shop, productId: BigInt(productId), productTitle, currentQuantity: qty, previousQuantity: 0, inventoryStatus: invStatus },
        });
      }
    } else if (existing) {
      await prisma.inventoryTracking.deleteMany({ where: { shop, productId: BigInt(productId) } });
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
    // Skip if already running
    if (syncState.get(shop)?.running) {
      return { status: "already_running" };
    }

    const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
    const plan = storeSession?.plan ?? "basic";
    const maxProducts = getMaxProducts(plan);
    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;

    syncState.start(shop);

    // Fire and forget — do not await
    runProductSync({ admin, shop, maxProducts, threshold }).catch(() => {});

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
                value={edits[key] ?? ""}
                onChange={(e) => onEdit(key, e.target.value)}
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
                        value={edits[key] ?? ""}
                        onChange={(e) => onEdit(key, e.target.value)}
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
  const { shop, plan, maxProducts, trackedCount, products, pageInfo, search, filter, after, syncRunning } = loaderData;

  const nav = useNavigation();
  const submit = useSubmit();
  const saveFetcher = useFetcher<typeof action>();
  const inventoryFetcher = useFetcher<{ inventoryData?: { variants: VariantInventory[] } | null; inventoryError?: string }>();

  const busy = nav.state === "submitting";
  const { revalidate } = useRevalidator();

  const [syncPct, setSyncPct] = useState<number | null>(null);
  const [syncStreamError, setSyncStreamError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const openSseStream = () => {
    if (esRef.current) return;
    setSyncStreamError(null);
    const es = new EventSource(`/api/sync-stream?shop=${encodeURIComponent(shop)}`);
    esRef.current = es;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "progress") setSyncPct(data.pct);
      if (data.type === "done") {
        setSyncPct(100);
        es.close();
        esRef.current = null;
        setTimeout(() => { setSyncPct(null); revalidate(); }, 1000);
      }
      if (data.type === "idle") {
        es.close();
        esRef.current = null;
        setSyncPct(null);
      }
      if (data.type === "error" || data.type === "auth_error") {
        setSyncStreamError(data.message ?? "Sync failed — network error.");
        es.close();
        esRef.current = null;
        setSyncPct(null);
      }
    };
    es.onerror = () => {
      setSyncStreamError("Sync connection lost. Please retry.");
      es.close();
      esRef.current = null;
      setSyncPct(null);
    };
  };

  // Open SSE when action returns "started"
  const actionData = useActionData<typeof action>();
  useEffect(() => {
    if ((actionData as any)?.status === "started") openSseStream();
  }, [actionData]);

  // Also open SSE if page loads with sync already running
  useEffect(() => {
    if (syncRunning && !esRef.current) openSseStream();
  }, [syncRunning]);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const enableTrackingFetcher = useFetcher<{ status?: string; error?: string }>();

  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editTracked, setEditTracked] = useState(false);
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());
  const [inventoryEdits, setInventoryEdits] = useState<Record<string, string>>({});

  // Initial inventory fetch when modal opens for an already-tracked product
  useEffect(() => {
    if (!editProduct || !editTracked) return;
    inventoryFetcher.load(`/app/products?intent=get_product_inventory&productId=${editProduct.productId}`);
    setExpandedVariants(new Set());
    setInventoryEdits({});
  }, [editProduct?.productId]);

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
  };

  const buildUrl = (params: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (filter !== "all") p.set("filter", filter);
    Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    const qs = p.toString();
    return `/app/products${qs ? `?${qs}` : ""}`;
  };

  const toggleVariant = (id: string) => {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saving = saveFetcher.state === "submitting";
  const loadingInventory = enableTrackingFetcher.state === "submitting";

  // Build inventory updates array for form submission
  const inventoryUpdates = Object.entries(inventoryEdits)
    .map(([key, val]) => {
      const parts = key.split("__");
      if (parts.length !== 2) return null;
      const quantity = parseInt(val);
      if (isNaN(quantity)) return null;
      return { inventoryItemId: parts[0], locationId: parts[1], quantity };
    })
    .filter(Boolean) as Array<{ inventoryItemId: string; locationId: string; quantity: number }>;

  const inventoryVariants = latestInventoryVariants;

  return (
    <s-page heading="Products" sub-heading={`${trackedCount} of ${maxProducts} products tracked · ${plan === "pro" ? "Professional" : "Basic"} plan`}>
      <SyncButton
        slot="primary-action"
        pct={syncPct}
        onClick={() => { if (syncPct === null && !busy) { setSyncStreamError(null); submit({ intent: "sync" }, { method: "post" }); } }}
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
              setSyncStreamError(null);
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
            <a href={`/app/products${filter !== "all" ? `?filter=${filter}` : ""}`}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", textDecoration: "none", fontSize: 14, color: "#374151", lineHeight: "1.5" }}>
              Clear
            </a>
          )}
        </Form>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
          {FILTER_TABS.map((tab) => (
            <a
              key={tab.key}
              href={buildUrl({ filter: tab.key === "all" ? null : tab.key, after: null })}
              style={{
                padding: "6px 14px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap",
                fontWeight: filter === tab.key || (tab.key === "all" && filter === "all") ? 600 : 400,
                color: filter === tab.key || (tab.key === "all" && filter === "all") ? "#111827" : "#6b7280",
                borderBottom: filter === tab.key || (tab.key === "all" && filter === "all") ? "2px solid #111827" : "2px solid transparent",
              }}
            >
              {tab.label}
            </a>
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
                  {["Product", "SKU", "Quantity", "Status", "Action"].map((h) => (
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
            {after ? "Showing next page" : "Showing first page"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {after && (
              <a href={buildUrl({ after: null })} style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>
                ← First Page
              </a>
            )}
            {pageInfo.hasNextPage && pageInfo.endCursor && (
              <a href={buildUrl({ after: pageInfo.endCursor })} style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>
                Next →
              </a>
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

                {/* Track inventory toggle — always visible */}
                <div style={{ marginBottom: editTracked ? 16 : 24, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Track inventory in Stock Alert</p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: editTracked ? "#059669" : "#9ca3af" }}>
                        {editTracked ? "Monitoring active — alerts will fire for this product." : "Not monitored — no alerts will be sent."}
                      </p>
                    </div>
                    <div
                      onClick={() => {
                        const next = !editTracked;
                        setEditTracked(next);
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
