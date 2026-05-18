import { useState, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation, useSubmit, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMaxProducts } from "../lib/plan-limits";

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

const LOCATIONS_QUERY = `{ locations(first: 1) { edges { node { id } } } }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
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
    const shopifyStatus: string = p.status; // ACTIVE | DRAFT | ARCHIVED

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

  return { shop, plan, maxProducts, trackedCount, threshold, products, pageInfo, search, filter, after };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "update_product") {
    const productId = form.get("productId") as string;
    const shopifyStatus = form.get("shopifyStatus") as string;
    const quantityRaw = form.get("quantity") as string;
    const quantity = quantityRaw !== "" ? parseInt(quantityRaw) : null;
    const tracked = form.get("tracked") === "true";
    const inventoryItemId = form.get("inventoryItemId") as string | null;
    const productTitle = form.get("productTitle") as string;
    const errors: string[] = [];

    // 1. Update Shopify product status
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

    // 2. Update inventory quantity in Shopify
    if (quantity !== null && inventoryItemId) {
      try {
        const locRes = await admin.graphql(LOCATIONS_QUERY);
        const locJson: any = await locRes.json();
        const locationId: string | undefined = locJson.data?.locations?.edges?.[0]?.node?.id;
        if (locationId) {
          const invRes = await admin.graphql(INVENTORY_SET_MUTATION, {
            variables: {
              input: {
                name: "available",
                reason: "correction",
                ignoreCompareQuantity: true,
                quantities: [{ inventoryItemId, locationId, quantity }],
              },
            },
          });
          const invJson: any = await invRes.json();
          const invErrs = invJson.data?.inventorySetQuantities?.userErrors ?? [];
          if (invErrs.length > 0) errors.push(invErrs.map((e: any) => e.message).join(", "));
        }
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
      const qty = quantity ?? existing?.currentQuantity ?? 0;
      const invStatus: "in_stock" | "low_stock" | "out_of_stock" =
        qty <= 0 ? "out_of_stock" : qty <= threshold ? "low_stock" : "in_stock";
      if (existing) {
        await prisma.inventoryTracking.update({
          where: { id: existing.id },
          data: { ...(quantity !== null ? { currentQuantity: qty, inventoryStatus: invStatus } : {}), lastCheckedAt: new Date() },
        });
      } else {
        const qty2 = quantity ?? 0;
        const invStatus2: "in_stock" | "low_stock" | "out_of_stock" =
          qty2 <= 0 ? "out_of_stock" : qty2 <= threshold ? "low_stock" : "in_stock";
        await prisma.inventoryTracking.create({
          data: { shop, productId: BigInt(productId), productTitle, currentQuantity: qty2, previousQuantity: 0, inventoryStatus: invStatus2 },
        });
      }
    } else if (existing) {
      await prisma.inventoryTracking.deleteMany({ where: { shop, productId: BigInt(productId) } });
    }

    if (errors.length > 0) return { error: errors.join(" | "), updatedProductId: productId };
    return { success: true, message: "Product updated successfully.", updatedProductId: productId };
  }

  if (intent === "sync") {
    const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
    const plan = storeSession?.plan ?? "basic";
    const maxProducts = getMaxProducts(plan);
    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;

    let allProducts: any[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    try {
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
      }
    } catch (err) {
      return { error: `Failed to fetch products from Shopify: ${err instanceof Error ? err.message : "Unknown error"}` };
    }

    for (const p of allProducts) {
      await prisma.inventoryTracking.upsert({
        where: { shop_productId: { shop, productId: p.productId } },
        update: { productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus, lastCheckedAt: new Date() },
        create: { shop, productId: p.productId, productTitle: p.productTitle, sku: p.sku, currentQuantity: p.currentQuantity, previousQuantity: p.currentQuantity, inventoryStatus: p.inventoryStatus },
      });
    }

    await prisma.setupProgress.upsert({
      where: { shop },
      update: { firstProductTracked: true, productThresholdsConfigured: true },
      create: { shop, appInstalled: true, firstProductTracked: true, productThresholdsConfigured: true, globalSettingsConfigured: false, notificationsConfigured: false },
    });

    return { success: true, message: `Synced ${allProducts.length} products.` };
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
  { value: "ARCHIVED", label: "Unlisted (Archived)" },
];

type ProductRow = ReturnType<typeof useLoaderData<typeof loader>>["products"][number];

export default function ProductsPage() {
  const { plan, maxProducts, trackedCount, products, pageInfo, search, filter, after } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const fetcher = useFetcher<typeof action>();
  const busy = nav.state === "submitting";
  const intent = nav.formData?.get("intent") as string | null;

  const [editProduct, setEditProduct] = useState<ProductRow | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editTracked, setEditTracked] = useState(false);

  // Close modal on successful update
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && "success" in fetcher.data) {
      setEditProduct(null);
    }
  }, [fetcher.state, fetcher.data]);

  const openEdit = (p: ProductRow) => {
    setEditProduct(p);
    setEditStatus(p.shopifyStatus ?? "ACTIVE");
    setEditQty(p.inventoryStatus === "not_tracked" ? "" : String(p.currentQuantity));
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

  const saving = fetcher.state === "submitting";

  return (
    <s-page heading="Products" sub-heading={`${trackedCount} of ${maxProducts} products tracked · ${plan === "pro" ? "Professional" : "Basic"} plan`}>
      <s-button slot="primary-action" onClick={() => submit({ intent: "sync" }, { method: "post" })} loading={busy && intent === "sync" ? true : undefined}>
        Sync Products
      </s-button>

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
                {products.map((p) => {
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
          <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            {/* Modal header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 14 }}>
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

            {/* Fetcher error */}
            {fetcher.data && "error" in fetcher.data && (
              <div style={{ margin: "12px 24px 0", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", color: "#991b1b", fontSize: 13 }}>
                {fetcher.data.error}
              </div>
            )}

            {/* Modal form */}
            <fetcher.Form method="post" style={{ padding: "20px 24px 24px" }}>
              <input type="hidden" name="intent" value="update_product" />
              <input type="hidden" name="productId" value={editProduct.productId} />
              <input type="hidden" name="productTitle" value={editProduct.productTitle ?? ""} />
              <input type="hidden" name="inventoryItemId" value={editProduct.inventoryItemId ?? ""} />

              {/* Shopify status */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
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

              {/* Available quantity */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
                  Available Quantity
                  {!editProduct.inventoryItemId && (
                    <span style={{ fontWeight: 400, color: "#9ca3af", marginLeft: 6 }}>(read-only — no tracked variants)</span>
                  )}
                </label>
                <input
                  type="number"
                  name="quantity"
                  value={editQty}
                  onChange={(e) => setEditQty(e.target.value)}
                  disabled={!editProduct.inventoryItemId}
                  placeholder="e.g. 25"
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", fontSize: 14, boxSizing: "border-box", opacity: !editProduct.inventoryItemId ? 0.5 : 1 }}
                />
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>Updates inventory at your primary Shopify location.</p>
              </div>

              {/* Inventory tracked toggle */}
              <div style={{ marginBottom: 24, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Track inventory in Stock Alert</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>
                      {editTracked ? "Monitoring active — alerts will fire for this product." : "Not monitored — no alerts will be sent."}
                    </p>
                  </div>
                  <div
                    onClick={() => setEditTracked(!editTracked)}
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
            </fetcher.Form>
          </div>
        </div>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
