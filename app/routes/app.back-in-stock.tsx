import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { format } from "date-fns";

const PAGE_SIZE = 50;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);

  const [rows, total, productGroups, restockDates] = await Promise.all([
    prisma.backInStockSubscriber.findMany({
      where: { shop },
      orderBy: { subscribedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.backInStockSubscriber.count({ where: { shop } }),
    prisma.backInStockSubscriber.groupBy({
      by: ["productId", "productTitle"],
      where: { shop },
      _count: { _all: true },
      orderBy: { _count: { email: "desc" } },
    }),
    prisma.inventoryTracking.findMany({
      where: { shop },
      select: { productId: true, expectedRestockDate: true },
    }),
  ]);

  const appUrl = process.env.SHOPIFY_APP_URL ?? "";

  return {
    subscribers: rows.map((r) => ({
      id: r.id,
      productId: r.productId.toString(),
      productTitle: r.productTitle,
      email: r.email,
      subscribedAt: r.subscribedAt.toISOString(),
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    productGroups: productGroups.map((g) => {
      const rd = restockDates.find((r) => r.productId === g.productId);
      return {
        productId: g.productId.toString(),
        productTitle: g.productTitle,
        count: g._count._all,
        expectedRestockDate: rd?.expectedRestockDate?.toISOString().slice(0, 10) ?? null,
      };
    }),
    widgetSnippet: `<script>
  (function() {
    var form = document.getElementById('bis-form');
    if (!form) return;
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      var email = form.querySelector('[name=email]').value;
      fetch('${appUrl}/api/back-in-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: '{{ shop.permanent_domain }}',
          productId: '{{ product.id }}',
          productTitle: '{{ product.title | escape }}',
          email: email
        })
      }).then(function(r) { return r.json(); }).then(function(data) {
        form.innerHTML = data.success
          ? '<p style="color:green">' + data.message + '</p>'
          : '<p style="color:red">' + data.error + '</p>';
      });
    });
  })();
<\/script>`,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "delete_subscriber") {
    const id = form.get("id") as string;
    if (id) await prisma.backInStockSubscriber.deleteMany({ where: { id, shop } });
    return { deleted: id };
  }

  if (intent === "clear_product") {
    const productId = form.get("productId") as string;
    if (productId) {
      await prisma.backInStockSubscriber.deleteMany({
        where: { shop, productId: BigInt(productId) },
      });
    }
    return { cleared: true };
  }

  return null;
};

export default function BackInStockPage() {
  const { subscribers, total, page, totalPages, productGroups, widgetSnippet } = useLoaderData<typeof loader>();
  const deleteFetcher = useFetcher<typeof action>();

  const buildUrl = (p: number) => `/app/back-in-stock${p > 1 ? `?page=${p}` : ""}`;

  return (
    <s-page
      heading="Back in Stock"
      sub-heading={`${total} subscriber${total !== 1 ? "s" : ""} waiting for restocks`}
    >
      {/* Summary by product */}
      {productGroups.length > 0 && (
        <s-section heading="Subscribers by Product">
          <div style={{ display: "flex", flexDirection: "column", gap: 0, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {productGroups.map((g, i) => (
              <div
                key={g.productId}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: i < productGroups.length - 1 ? "1px solid #f3f4f6" : "none" }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{g.productTitle ?? `Product #${g.productId}`}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    ID: {g.productId}
                    {g.expectedRestockDate && (
                      <span style={{ marginLeft: 10, color: "#059669", fontWeight: 500 }}>
                        · Expected back: {new Date(g.expectedRestockDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: "#4f46e5" }}>{g.count}</span>
                  <Form method="post" onSubmit={(e) => { if (!confirm(`Remove all ${g.count} subscriber(s) for this product?`)) e.preventDefault(); }}>
                    <input type="hidden" name="intent" value="clear_product" />
                    <input type="hidden" name="productId" value={g.productId} />
                    <button
                      type="submit"
                      style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer" }}
                    >
                      Clear
                    </button>
                  </Form>
                </div>
              </div>
            ))}
          </div>
        </s-section>
      )}

      {/* Widget setup guide */}
      <div style={{ marginTop: 24 }}>
        <s-section heading="Add the Widget to Your Theme">
          <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 12 }}>
            Add the following Liquid snippet to your product page template (in your theme editor) to show a "Notify me" form when a product is out of stock.
          </p>

          <div style={{ background: "#1e1e2e", borderRadius: 8, padding: "16px 20px", marginBottom: 16, overflowX: "auto" }}>
            <pre style={{ margin: 0, fontSize: 12, color: "#cdd6f4", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{`{%- if product.available == false -%}
  <div id="bis-form-wrapper" style="margin: 16px 0;">
    <p style="font-size:14px;color:#374151;margin-bottom:8px;">
      Get notified when this product is back in stock:
    </p>
    <form id="bis-form" style="display:flex;gap:8px;flex-wrap:wrap;">
      <input
        type="email"
        name="email"
        placeholder="your@email.com"
        required
        style="flex:1;min-width:200px;border:1px solid #d1d5db;border-radius:6px;padding:8px 12px;font-size:14px;"
      />
      <button type="submit"
        style="padding:8px 16px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">
        Notify Me
      </button>
    </form>
  </div>
  ${widgetSnippet}
{%- endif -%}`}</pre>
          </div>

          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            Paste this into <strong>Sections &gt; product-template.liquid</strong> (or your theme's product section), just below the "Add to cart" button. The form only shows when the product is out of stock.
          </p>
        </s-section>
      </div>

      {/* Subscriber list */}
      <div style={{ marginTop: 24 }}>
        <s-section heading="All Subscribers">
          {subscribers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 20px", color: "#6b7280" }}>
              <p style={{ fontSize: 15, marginBottom: 4 }}>No subscribers yet.</p>
              <p style={{ fontSize: 13 }}>Once customers sign up via the widget, they'll appear here.</p>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                      {["Product", "Email", "Signed Up", "Notified", ""].map((h, i) => (
                        <th key={i} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subscribers.map((sub) => (
                      <tr key={sub.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "10px 12px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <div style={{ fontWeight: 500 }}>{sub.productTitle ?? `#${sub.productId}`}</div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#374151" }}>{sub.email}</td>
                        <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 13 }}>
                          {format(new Date(sub.subscribedAt), "MMM d, yyyy")}
                        </td>
                        <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                          {sub.notifiedAt ? (
                            <span style={{ fontSize: 12, background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: 10, fontWeight: 500 }}>
                              {format(new Date(sub.notifiedAt), "MMM d")}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>Pending</span>
                          )}
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => deleteFetcher.submit({ intent: "delete_subscriber", id: sub.id }, { method: "post" })}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "4px 6px", borderRadius: 4 }}
                            onMouseOver={(e) => (e.currentTarget.style.color = "#dc2626")}
                            onMouseOut={(e) => (e.currentTarget.style.color = "#9ca3af")}
                            title="Remove subscriber"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>Page {page} of {totalPages}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {page > 1 && <a href={buildUrl(page - 1)} style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>← Previous</a>}
                    {page < totalPages && <a href={buildUrl(page + 1)} style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}>Next →</a>}
                  </div>
                </div>
              )}
            </>
          )}
        </s-section>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
