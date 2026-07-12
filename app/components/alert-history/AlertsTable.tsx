import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { format } from "date-fns";
import { useAlertHistoryStore, buildAlertHistoryUrl } from "../../stores/alert-history-store";
import { SkeletonBlock } from "../Skeleton";

const ALERT_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  low_stock:    { label: "Low Stock",     bg: "#fef3c7", color: "#92400e" },
  out_of_stock: { label: "Out of Stock",  bg: "#fee2e2", color: "#991b1b" },
  restock:      { label: "Back in Stock", bg: "#d1fae5", color: "#065f46" },
};

export function AlertsTable() {
  const { alerts, totalPages } = useAlertHistoryStore((s) => s.data!);
  const typeFilter = useAlertHistoryStore((s) => s.typeFilter);
  const productSearch = useAlertHistoryStore((s) => s.productSearch);
  const page = useAlertHistoryStore((s) => s.page);
  const buildUrl = (overrides: Record<string, string | number | null>) =>
    buildAlertHistoryUrl({ typeFilter, productSearch, page }, overrides);
  const deleteFetcher = useFetcher();
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

export function AlertsTableSkeleton() {
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
