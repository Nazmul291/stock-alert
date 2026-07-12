import { format } from "date-fns";
import type { DashboardData } from "../lib/dashboard-data.server";

export function RecentAlertsSection({ alerts }: { alerts: DashboardData["recentAlerts"] }) {
  return (
    <s-section heading="Recent Alerts">
      <s-link slot="primary-action" href="/app/alert-history">View all →</s-link>
      {alerts.length === 0 ? (
        <s-paragraph>No alerts yet — alerts will appear here when inventory thresholds are triggered.</s-paragraph>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alerts.map((alert) => (
            <div key={alert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{alert.productTitle ?? "Unknown Product"}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {alert.alertType === "low_stock" && "Low Stock Alert"}
                  {alert.alertType === "out_of_stock" && "Out of Stock Alert"}
                  {alert.alertType === "restock" && "Back in Stock"}
                </div>
              </div>
              <span style={{
                fontSize: 12, padding: "2px 8px", borderRadius: 12, fontWeight: 500,
                background: alert.alertType === "out_of_stock" ? "#fee2e2" : alert.alertType === "low_stock" ? "#fef3c7" : "#d1fae5",
                color: alert.alertType === "out_of_stock" ? "#991b1b" : alert.alertType === "low_stock" ? "#92400e" : "#065f46",
              }}>
                {format(new Date(alert.sentAt), "MMM d, h:mm a")}
              </span>
            </div>
          ))}
        </div>
      )}
    </s-section>
  );
}
