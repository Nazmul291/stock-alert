import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Link, Form, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { format } from "date-fns";
import { SkeletonBlock, SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { AlertsData } from "../lib/alert-history-data.server";
import { useSSEData } from "../hooks/use-sse-data";

const ALERT_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  low_stock:    { label: "Low Stock",     bg: "#fef3c7", color: "#92400e" },
  out_of_stock: { label: "Out of Stock",  bg: "#fee2e2", color: "#991b1b" },
  restock:      { label: "Back in Stock", bg: "#d1fae5", color: "#065f46" },
};

const TYPE_TABS = [
  { key: "all",          label: "All" },
  { key: "low_stock",    label: "Low Stock" },
  { key: "out_of_stock", label: "Out of Stock" },
  { key: "restock",      label: "Back in Stock" },
];

// Filters come straight from the URL — available immediately, no DB needed —
// so they're returned synchronously. The actual alert rows load entirely in
// the background via api.alert-history-stream.ts (same filter params, passed
// through the query string) and stream to the client over SSE once ready.
// loadAlerts itself lives in app/lib/alert-history-data.server.ts, not here —
// see app._index.tsx's loader comment for why a plain exported function can't
// stay in a route file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const typeFilter = url.searchParams.get("type") ?? "all";
  const productSearch = url.searchParams.get("product") ?? "";
  const token = await mintSseToken(shop);

  return { page, typeFilter, productSearch, token };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "delete_one") {
    const id = form.get("id") as string;
    if (id) await prisma.alertHistory.deleteMany({ where: { id, shop } });
    return { deleted: id };
  }

  if (intent === "clear_all") {
    await prisma.alertHistory.deleteMany({ where: { shop } });
    return { cleared: true };
  }

  return { error: "Unknown intent" };
};

export default function AlertHistoryPage() {
  const { typeFilter, productSearch, page, token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<AlertsData>(
    `/api/alert-history-stream?token=${encodeURIComponent(token)}&page=${page}&type=${encodeURIComponent(typeFilter)}&product=${encodeURIComponent(productSearch)}`,
  );

  const buildUrl = (overrides: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    if (typeFilter !== "all") p.set("type", typeFilter);
    if (productSearch) p.set("product", productSearch);
    if (page > 1) p.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null || v === "all" || v === 1) p.delete(k);
      else p.set(k, String(v));
    }
    const qs = p.toString();
    return `/app/alert-history${qs ? `?${qs}` : ""}`;
  };

  return (
    <s-page heading="Alert History" sub-heading="Track every low-stock and back-in-stock alert">
      <s-button slot="primary-action" variant="primary" href="/app">Back to Dashboard</s-button>

      <s-section heading="">
        {/* Top bar: search + clear all — search renders immediately (URL-derived,
            no DB needed); Clear All depends on knowing whether there's anything
            to clear, so it streams in independently once that's known. */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Form method="get" style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
            {typeFilter !== "all" && <input type="hidden" name="type" value={typeFilter} />}
            <input
              name="product"
              defaultValue={productSearch}
              placeholder="Search by product name…"
              style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }}
              aria-label="Search by product name"
            />
            <button type="submit" style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
              Search
            </button>
            {productSearch && (
              <Link
                to={buildUrl({ product: null, page: 1 })}
                style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", textDecoration: "none", fontSize: 14, color: "#374151", lineHeight: "1.5" }}
              >
                Clear
              </Link>
            )}
          </Form>

          {data && data.total > 0 && <ClearAllButton total={data.total} />}
        </div>

        {/* Filter tabs — URL-derived, render immediately */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
          {TYPE_TABS.map((tab) => (
            <Link
              key={tab.key}
              to={buildUrl({ type: tab.key, page: 1, product: null })}
              style={{
                padding: "6px 14px",
                fontSize: 13,
                textDecoration: "none",
                whiteSpace: "nowrap",
                fontWeight: typeFilter === tab.key ? 600 : 400,
                color: typeFilter === tab.key ? "#111827" : "#6b7280",
                borderBottom: typeFilter === tab.key ? "2px solid #111827" : "2px solid transparent",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {error ? (
          <SSEErrorRetry message={error} onRetry={retry} />
        ) : data ? (
          <AlertsTable data={data} page={page} buildUrl={buildUrl} />
        ) : (
          <AlertsTableSkeleton />
        )}
      </s-section>
    </s-page>
  );
}

function ClearAllButton({ total }: { total: number }) {
  return (
    <Form
      method="post"
      onSubmit={(e) => {
        if (!confirm(`Delete all ${total} alert${total !== 1 ? "s" : ""}? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="clear_all" />
      <button
        type="submit"
        style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}
      >
        Clear All
      </button>
    </Form>
  );
}

function AlertsTable({ data, page, buildUrl }: {
  data: AlertsData;
  page: number;
  buildUrl: (overrides: Record<string, string | number | null>) => string;
}) {
  const { alerts, totalPages } = data;
  const deleteFetcher = useFetcher<typeof action>();
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const handleDelete = (id: string) => {
    setDeletedIds((prev) => { const next = new Set(prev); next.add(id); return next; });
    deleteFetcher.submit({ intent: "delete_one", id }, { method: "post" });
  };

  const visibleAlerts = alerts.filter((a) => !deletedIds.has(a.id));

  return (
    <>
      {visibleAlerts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>No alerts found.</p>
          <p style={{ fontSize: 14 }}>Alerts appear here when inventory thresholds are triggered.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {["Product", "Alert Type", "Qty", "Threshold", "Sent To", "Date", ""].map((h, i) => (
                  <th
                    key={i}
                    style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleAlerts.map((alert) => {
                const s = ALERT_STYLES[alert.alertType ?? ""] ?? { label: alert.alertType ?? "—", bg: "#f3f4f6", color: "#374151" };
                return (
                  <tr key={alert.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {alert.productTitle ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                        {s.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>
                      {alert.quantityAtAlert !== null ? alert.quantityAtAlert : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                      {alert.thresholdTriggered !== null ? alert.thresholdTriggered : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {alert.sentToEmail && (
                          <span style={{ fontSize: 11, background: "#eff6ff", color: "#1e40af", padding: "1px 6px", borderRadius: 4, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={alert.sentToEmail}>
                            ✉ {alert.sentToEmail}
                          </span>
                        )}
                        {alert.sentToSlack && (
                          <span style={{ fontSize: 11, background: "#f0fdf4", color: "#166534", padding: "1px 6px", borderRadius: 4 }}>
                            Slack
                          </span>
                        )}
                        {!alert.sentToEmail && !alert.sentToSlack && (
                          <span style={{ fontSize: 12, color: "#9ca3af" }}>—</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 13 }}>
                      {format(new Date(alert.sentAt), "MMM d, yyyy h:mm a")}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleDelete(alert.id)}
                        title="Delete this alert"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "4px 6px", borderRadius: 4, lineHeight: 1 }}
                        onMouseOver={(e) => (e.currentTarget.style.color = "#dc2626")}
                        onMouseOut={(e) => (e.currentTarget.style.color = "#9ca3af")}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
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
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <span style={{ fontSize: 13, color: "#6b7280" }}>
            Page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {page > 1 && (
              <Link
                to={buildUrl({ page: page - 1 })}
                style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
              >
                ← Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                to={buildUrl({ page: page + 1 })}
                style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function AlertsTableSkeleton() {
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <SkeletonBlock key={i} width="100%" height={40} borderRadius={6} />
        ))}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
