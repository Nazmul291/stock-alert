import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getMaxProducts } from "../lib/plan-limits";
import { format } from "date-fns";

const PRODUCTS_GRAPHQL = `
  query getProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id title handle status
          variants(first: 100) {
            edges {
              node { id title sku inventoryQuantity }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
  const pageSize = 50;

  const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  const plan = storeSession?.plan ?? "free";
  const maxProducts = getMaxProducts(plan);

  const settings = await prisma.storeSettings.findUnique({ where: { shop } });
  const threshold = settings?.lowStockThreshold ?? 5;

  const where = {
    shop,
    ...(search ? {
      OR: [
        { productTitle: { contains: search, mode: "insensitive" as const } },
        { sku: { contains: search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.inventoryTracking.findMany({
      where,
      orderBy: { productTitle: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inventoryTracking.count({ where }),
  ]);

  const trackedCount = await prisma.inventoryTracking.count({ where: { shop } });

  return {
    shop,
    plan,
    maxProducts,
    trackedCount,
    threshold,
    products: items.map((p) => ({
      id: p.id,
      productId: p.productId.toString(),
      productTitle: p.productTitle,
      sku: p.sku,
      currentQuantity: p.currentQuantity,
      inventoryStatus: p.inventoryStatus,
      isHidden: p.isHidden,
      lastCheckedAt: p.lastCheckedAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    search,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "sync") {
    const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
    const plan = storeSession?.plan ?? "free";
    const maxProducts = getMaxProducts(plan);

    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;

    // Fetch all products from Shopify with pagination
    let allProducts: any[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    try {
      while (hasNextPage && allProducts.length < maxProducts) {
        const batchSize = Math.min(250, maxProducts - allProducts.length);
        const gqlResponse = await admin.graphql(PRODUCTS_GRAPHQL, {
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

          for (const ve of p.variants.edges) {
            const v = ve.node;
            totalQty += v.inventoryQuantity ?? 0;
            if (v.sku) skus.push(v.sku);
          }

          const status: "in_stock" | "low_stock" | "out_of_stock" =
            totalQty === 0 ? "out_of_stock" : totalQty <= threshold ? "low_stock" : "in_stock";

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

    // Update setup progress
    await prisma.setupProgress.upsert({
      where: { shop },
      update: { firstProductTracked: true, productThresholdsConfigured: true },
      create: { shop, appInstalled: true, firstProductTracked: true, productThresholdsConfigured: true, globalSettingsConfigured: false, notificationsConfigured: false },
    });

    return { success: true, message: `Synced ${allProducts.length} products.` };
  }

  if (intent === "reset") {
    await prisma.$transaction([
      prisma.inventoryTracking.deleteMany({ where: { shop } }),
      prisma.alertHistory.deleteMany({ where: { shop } }),
    ]);
    return { success: true, message: "All product data has been reset." };
  }

  return { error: "Unknown action." };
};

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  in_stock: { bg: "#d1fae5", color: "#065f46", label: "In Stock" },
  low_stock: { bg: "#fef3c7", color: "#92400e", label: "Low Stock" },
  out_of_stock: { bg: "#fee2e2", color: "#991b1b", label: "Out of Stock" },
  deactivated: { bg: "#f3f4f6", color: "#374151", label: "Deactivated" },
};

export default function ProductsPage() {
  const { plan, maxProducts, trackedCount, products, pagination, search } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state === "submitting";
  const intent = nav.formData?.get("intent");

  return (
    <s-page heading="Products" sub-heading={`${trackedCount} of ${maxProducts} products tracked · ${plan === "pro" ? "Professional" : "Free"} plan`}>
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
          Free plan: monitoring up to {maxProducts} products.{" "}
          <a href="/app/billing" style={{ color: "#1d4ed8", fontWeight: 600 }}>Upgrade to Pro →</a>
        </div>
      )}

      {/* Search */}
      <s-section heading="">
        <Form method="get" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input name="search" defaultValue={search} placeholder="Search by title or SKU…"
            style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }}
            aria-label="Search products" />
          <button type="submit" style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
            Search
          </button>
          {search && <a href="/app/products" style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", textDecoration: "none", fontSize: 14, color: "#374151", lineHeight: "1.5" }}>Clear</a>}
        </Form>

        {products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
            <p style={{ fontSize: 16, marginBottom: 8 }}>No products found.</p>
            <p style={{ fontSize: 14 }}>Click <strong>Sync Products</strong> to import your Shopify inventory.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Product", "SKU", "Quantity", "Status", "Visibility", "Last Checked"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const s = STATUS_STYLE[p.inventoryStatus ?? "in_stock"] ?? STATUS_STYLE.in_stock;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 500 }}>
                        <a href={`https://${p.productId}`} style={{ color: "#1d4ed8", textDecoration: "none" }}>{p.productTitle ?? "—"}</a>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{p.sku ?? "—"}</td>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: p.currentQuantity === 0 ? "#dc2626" : p.currentQuantity <= 5 ? "#d97706" : "#059669" }}>
                        {p.currentQuantity}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500 }}>{s.label}</span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280" }}>{p.isHidden ? "Hidden" : "Visible"}</td>
                      <td style={{ padding: "10px 12px", color: "#9ca3af", fontSize: 12 }}>{format(new Date(p.lastCheckedAt), "MMM d, h:mm a")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 16, alignItems: "center" }}>
            {pagination.page > 1 && (
              <a href={`/app/products?page=${pagination.page - 1}&search=${search}`} style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>← Prev</a>
            )}
            <span style={{ fontSize: 13, color: "#6b7280" }}>Page {pagination.page} of {pagination.totalPages} ({pagination.total} products)</span>
            {pagination.page < pagination.totalPages && (
              <a href={`/app/products?page=${pagination.page + 1}&search=${search}`} style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>Next →</a>
            )}
          </div>
        )}
      </s-section>

      {/* Danger zone */}
      <s-section heading="Data Management" slot="aside">
        <s-paragraph>Reset all synced product data. This cannot be undone.</s-paragraph>
        <Form method="post" onSubmit={(e) => { if (!confirm("Reset all product data? This cannot be undone.")) e.preventDefault(); }}>
          <input type="hidden" name="intent" value="reset" />
          <button type="submit" disabled={busy} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 13, width: "100%" }}>
            {busy && intent === "reset" ? "Resetting…" : "Reset Product Data"}
          </button>
        </Form>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
