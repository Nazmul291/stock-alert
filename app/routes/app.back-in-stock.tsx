import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, Form } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { format } from "date-fns";
import { SkeletonBlock, SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { BackInStockData } from "../lib/back-in-stock-data.server";
import { useSSEData } from "../hooks/use-sse-data";

// `page` comes straight from the URL — available immediately. Everything else
// loads entirely in the background via api.back-in-stock-stream.ts and streams
// to the client over SSE once ready. loadBackInStockData itself lives in
// app/lib/back-in-stock-data.server.ts, not here — see app._index.tsx's loader
// comment for why a plain exported function can't stay in a route file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const token = await mintSseToken(shop);

  return { page, token };
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

function statCard(label: string, value: number | string, color: string) {
  return (
    <div key={label} style={{ flex: 1, minWidth: 120, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function BackInStockPage() {
  const { page, token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<BackInStockData>(
    `/api/back-in-stock-stream?token=${encodeURIComponent(token)}&page=${page}`,
  );

  if (error) {
    return (
      <s-page heading="Back in Stock" sub-heading="Manage customers waiting for restocked products">
        <SSEErrorRetry message={error} onRetry={retry} />
      </s-page>
    );
  }

  if (!data) {
    return (
      <s-page heading="Back in Stock" sub-heading="Manage customers waiting for restocked products">
        <StatsSkeleton />
        <div style={{ marginTop: 24 }}>
          <SubscriberListSkeleton />
        </div>
      </s-page>
    );
  }

  return (
    <s-page heading="Back in Stock" sub-heading="Manage customers waiting for restocked products">
      {/* Stats */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {statCard("Total Subscribers", data.total, "#111827")}
        {statCard("Waiting", data.pendingCount, "#d97706")}
        {statCard("Notified", data.notifiedCount, "#059669")}
        {statCard("Products Watched", data.productGroups.length, "#4f46e5")}
      </div>

      {/* Subscribers by product */}
      {data.productGroups.length > 0 && <ProductGroupsSection productGroups={data.productGroups} />}

      {/* Subscriber list */}
      <div style={{ marginTop: 24 }}>
        <SubscriberList data={data} page={page} />
      </div>
    </s-page>
  );
}

function ProductGroupsSection({ productGroups }: { productGroups: BackInStockData["productGroups"] }) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Subscribers by Product">
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {productGroups.map((g, i) => (
            <div
              key={g.productId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: i % 2 === 0 ? "#fff" : "#f9fafb",
                borderBottom: i < productGroups.length - 1 ? "1px solid #f3f4f6" : "none",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
                  {g.productTitle ?? `Product #${g.productId}`}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  ID: {g.productId}
                  {g.expectedRestockDate && (
                    <span style={{ marginLeft: 10, color: "#059669", fontWeight: 500 }}>
                      · Expected back:{" "}
                      {new Date(g.expectedRestockDate + "T00:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#4f46e5" }}>{g.count}</span>
                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (!confirm(`Remove all ${g.count} subscriber(s) for this product?`))
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="clear_product" />
                  <input type="hidden" name="productId" value={g.productId} />
                  <button
                    type="submit"
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 6,
                      border: "1px solid #fca5a5",
                      background: "#fee2e2",
                      color: "#991b1b",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </Form>
              </div>
            </div>
          ))}
        </div>
      </s-section>
    </div>
  );
}

function SubscriberList({ data, page }: { data: BackInStockData; page: number }) {
  const { subscribers, total, totalPages } = data;
  const deleteFetcher = useFetcher<typeof action>();
  const buildUrl = (p: number) => `/app/back-in-stock${p > 1 ? `?page=${p}` : ""}`;

  return (
    <s-section heading={`All Subscribers (${total})`}>
      {subscribers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: "0 0 6px" }}>No subscribers yet</p>
          <p style={{ fontSize: 13, margin: 0 }}>
            Enable the theme app embed in Settings — customers will appear here once they sign up.
          </p>
        </div>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb", background: "#f9fafb" }}>
                  {["Product", "Name", "Email", "Signed Up", "Status", ""].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        fontWeight: 600,
                        color: "#374151",
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscribers.map((sub) => {
                  const fullName = [sub.firstName, sub.lastName].filter(Boolean).join(" ");
                  return (
                    <tr key={sub.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 500, color: "#111827" }}>
                          {sub.productTitle ?? `#${sub.productId}`}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                        {fullName || <span style={{ color: "#d1d5db" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>{sub.email}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 13 }}>
                        {format(new Date(sub.subscribedAt), "MMM d, yyyy")}
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {sub.notifiedAt ? (
                          <span
                            style={{
                              fontSize: 12,
                              background: "#d1fae5",
                              color: "#065f46",
                              padding: "3px 10px",
                              borderRadius: 10,
                              fontWeight: 500,
                            }}
                          >
                            Notified {format(new Date(sub.notifiedAt), "MMM d")}
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: 12,
                              background: "#fef3c7",
                              color: "#92400e",
                              padding: "3px 10px",
                              borderRadius: 10,
                              fontWeight: 500,
                            }}
                          >
                            Waiting
                          </span>
                    )}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={() =>
                            deleteFetcher.submit(
                              { intent: "delete_subscriber", id: sub.id },
                              { method: "post" },
                            )
                          }
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                            padding: "4px 6px",
                            borderRadius: 4,
                          }}
                          onMouseOver={(e) => (e.currentTarget.style.color = "#dc2626")}
                          onMouseOut={(e) => (e.currentTarget.style.color = "#9ca3af")}
                          title="Remove subscriber"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6" /><path d="M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                Page {page} of {totalPages} · {total} subscribers
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                {page > 1 && <s-link href={buildUrl(page - 1)}>← Previous</s-link>}
                {page < totalPages && <s-link href={buildUrl(page + 1)}>Next →</s-link>}
              </div>
            </div>
          )}
        </>
      )}
    </s-section>
  );
}

function StatsSkeleton() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ flex: 1, minWidth: 120, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
          <SkeletonBlock width={48} height={26} style={{ marginBottom: 6 }} />
          <SkeletonBlock width={90} height={13} />
        </div>
      ))}
    </div>
  );
}

function SubscriberListSkeleton() {
  return (
    <s-section heading="All Subscribers">
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonBlock key={i} width="100%" height={40} borderRadius={6} />
        ))}
      </div>
    </s-section>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
