import { format } from "date-fns";
import { useDashboardStore } from "../../stores/dashboard-store";

// Shown in place of real rows while loading — we don't yet know whether
// there are any alerts, so this assumes there are (matching the rest of the
// dashboard's "reserve space" loading behavior) rather than flashing the
// empty state first.
//
// sentAt is a fixed constant, not `new Date()` — this module loads once and
// stays cached for the server process's whole lifetime, so `new Date()`
// here would freeze at server-start time while the client re-evaluates it
// fresh on every page load, drifting further apart the longer the server
// stays up and causing a hydration text mismatch. The actual value is
// irrelevant anyway since this span is masked by .skeleton-text while loading.
const PLACEHOLDER_ALERTS = Array.from({ length: 3 }, (_, i) => ({
  id: `skeleton-${i}`,
  productTitle: "Product name",
  alertType: "low_stock",
  sentAt: "2024-01-01T00:00:00.000Z",
}));

export function RecentAlertsSection() {
  const loading = useDashboardStore((s) => s.data === null);
  const alerts = useDashboardStore((s) => s.data?.recentAlerts) ?? [];
  const rows = loading ? PLACEHOLDER_ALERTS : alerts;

  return (
    <s-section heading="Recent Alerts">
      <s-link slot="primary-action" href="/app/alert-history">View all →</s-link>
      {rows.length === 0 ? (
        <s-paragraph>No alerts yet — alerts will appear here when inventory thresholds are triggered.</s-paragraph>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((alert) => (
            <div key={alert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
              <div>
                <div className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 600, fontSize: 14 }}>{alert.productTitle ?? "Unknown Product"}</div>
                <div className={loading ? "skeleton-text" : undefined} style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {alert.alertType === "low_stock" && "Low Stock Alert"}
                  {alert.alertType === "out_of_stock" && "Out of Stock Alert"}
                  {alert.alertType === "restock" && "Back in Stock"}
                </div>
              </div>
              <span
                className={loading ? "skeleton-text" : undefined}
                style={{
                  fontSize: 12, padding: "2px 8px", borderRadius: 12, fontWeight: 500,
                  // Neutral while loading — the alert type isn't known yet,
                  // so don't paint the badge with a specific type's color.
                  background: loading ? "#f3f4f6" : alert.alertType === "out_of_stock" ? "#fee2e2" : alert.alertType === "low_stock" ? "#fef3c7" : "#d1fae5",
                  color: loading ? "#6b7280" : alert.alertType === "out_of_stock" ? "#991b1b" : alert.alertType === "low_stock" ? "#92400e" : "#065f46",
                }}
              >
                {format(new Date(alert.sentAt), "MMM d, h:mm a")}
              </span>
            </div>
          ))}
        </div>
      )}
    </s-section>
  );
}
