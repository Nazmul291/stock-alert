import { useFetcher } from "react-router";
import { format } from "date-fns";
import { useBackInStockStore } from "../../stores/back-in-stock-store";

// Shown in place of real rows while loading — we don't yet know whether
// there are any subscribers, so this assumes there are (matching the rest of
// the page's "reserve space" loading behavior) rather than flashing the
// empty state first.
const PLACEHOLDER_SUBSCRIBERS = Array.from({ length: 5 }, (_, i) => ({
  id: `skeleton-${i}`,
  productId: "0",
  productTitle: "Product name",
  email: "customer@example.com",
  firstName: "First",
  lastName: "Last",
  subscribedAt: new Date().toISOString(),
  notifiedAt: null as string | null,
}));

export function BackInStockSubscriberList() {
  const loading = useBackInStockStore((s) => s.data === null);
  const subscribers = useBackInStockStore((s) => s.data?.subscribers) ?? [];
  const total = useBackInStockStore((s) => s.data?.total) ?? 0;
  const totalPages = useBackInStockStore((s) => s.data?.totalPages) ?? 1;
  const page = useBackInStockStore((s) => s.page);
  const deleteFetcher = useFetcher();
  const buildUrl = (p: number) => `/app/back-in-stock${p > 1 ? `?page=${p}` : ""}`;

  const rows = loading ? PLACEHOLDER_SUBSCRIBERS : subscribers;

  return (
    <s-section heading={`All Subscribers (${total})`}>
      {rows.length === 0 ? (
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
                {rows.map((sub) => {
                  const fullName = [sub.firstName, sub.lastName].filter(Boolean).join(" ");
                  return (
                    <tr key={sub.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 500, color: "#111827" }}>
                          {sub.productTitle ?? `#${sub.productId}`}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151", whiteSpace: "nowrap" }}>
                        {loading ? (
                          <span className="skeleton-text">{fullName}</span>
                        ) : (
                          fullName || <span style={{ color: "#d1d5db" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#374151" }}>
                        <span className={loading ? "skeleton-text" : undefined}>{sub.email}</span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap", fontSize: 13 }}>
                        <span className={loading ? "skeleton-text" : undefined}>{format(new Date(sub.subscribedAt), "MMM d, yyyy")}</span>
                      </td>
                      <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                        {sub.notifiedAt ? (
                          <span
                            className={loading ? "skeleton-text" : undefined}
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
                            className={loading ? "skeleton-text" : undefined}
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
                        {!loading && (
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
                            onFocus={(e) => (e.currentTarget.style.color = "#dc2626")}
                            onBlur={(e) => (e.currentTarget.style.color = "#9ca3af")}
                            title="Remove subscriber"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6" /><path d="M14 11v6" />
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!loading && totalPages > 1 && (
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
