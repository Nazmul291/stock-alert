import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation, useSubmit } from "react-router";
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

  // Fetch products from Shopify as the primary source
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
      pageInfo = {
        hasNextPage: productsData.pageInfo.hasNextPage,
        endCursor: productsData.pageInfo.endCursor,
      };
    }
  } catch {
    // Fall back to DB-only view if Shopify API unavailable
  }

  // Cross-reference with InventoryTracking
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
    for (const ve of p.variants.edges) {
      const v = ve.node;
      if (v.inventoryItem?.tracked !== false) allVariantsUntracked = false;
      totalQty += v.inventoryQuantity ?? 0;
      if (v.sku) skus.push(v.sku);
    }

    const imageUrl: string | null = p.featuredImage?.url ?? null;
    const imageAlt: string = p.featuredImage?.altText ?? (p.title as string);

    // Product whose inventory is not tracked by Shopify at all
    if (allVariantsUntracked) {
      return {
        id: tracking?.id ?? productId,
        productId,
        productTitle: tracking?.productTitle ?? (p.title as string),
        sku: tracking?.sku ?? (skus.join(", ") || null),
        currentQuantity: 0,
        inventoryStatus: "not_tracked" as string,
        isHidden: false,
        lastCheckedAt: null as string | null,
        isTracked: false,
        imageUrl,
        imageAlt,
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
        lastCheckedAt: tracking.lastCheckedAt.toISOString(),
        isTracked: true,
        imageUrl,
        imageAlt,
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
      lastCheckedAt: null as string | null,
      isTracked: false,
      imageUrl,
      imageAlt,
    };
  });

  const products =
    filter === "tracked"
      ? allProducts.filter((p) => p.isTracked)
      : filter === "not_tracked"
      ? allProducts.filter((p) => !p.isTracked)
      : allProducts;

  return {
    shop,
    plan,
    maxProducts,
    trackedCount,
    threshold,
    products,
    pageInfo,
    search,
    filter,
    after,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

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

          // Skip products Shopify doesn't track inventory for
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

export default function ProductsPage() {
  const { plan, maxProducts, trackedCount, products, pageInfo, search, filter, after } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state === "submitting";
  const intent = nav.formData?.get("intent") as string | null;

  const buildUrl = (params: Record<string, string | null>) => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (filter !== "all") p.set("filter", filter);
    Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
    const qs = p.toString();
    return `/app/products${qs ? `?${qs}` : ""}`;
  };

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
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e5e7eb", paddingBottom: 0 }}>
          {FILTER_TABS.map((tab) => (
            <a
              key={tab.key}
              href={buildUrl({ filter: tab.key === "all" ? null : tab.key, after: null })}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: filter === tab.key || (tab.key === "all" && !filter) ? 600 : 400,
                color: filter === tab.key || (tab.key === "all" && !filter) ? "#111827" : "#6b7280",
                borderBottom: filter === tab.key || (tab.key === "all" && !filter) ? "2px solid #111827" : "2px solid transparent",
                textDecoration: "none",
                whiteSpace: "nowrap",
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
                  {["Product", "SKU", "Quantity", "Status", "Visibility"].map((h) => (
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
                            <img
                              src={p.imageUrl}
                              alt={p.imageAlt}
                              width={40}
                              height={40}
                              style={{ borderRadius: 6, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }}
                            />
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
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                        {isNotTracked ? "—" : p.isHidden ? "Hidden" : "Visible"}
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
              <a href={buildUrl({ after: null })}
                style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>
                ← First Page
              </a>
            )}
            {pageInfo.hasNextPage && pageInfo.endCursor && (
              <a href={buildUrl({ after: pageInfo.endCursor })}
                style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>
                Next →
              </a>
            )}
          </div>
        </div>
      </s-section>

    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
