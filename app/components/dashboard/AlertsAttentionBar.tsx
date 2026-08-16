import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";
import { useDashboardStore } from "../../stores/dashboard-store";

// Replaces RecentAlertsSection's detailed list with a slim one-line summary
// bar, matching the mockup — the full alert history still lives at
// /app/alert-history, this is just a pointer to it. Reuses alertsToday
// (already computed) rather than adding a new "needs attention" count.
export function AlertsAttentionBar() {
  const navigate = useShopAwareNavigate();
  const loading = useDashboardStore((s) => s.data === null);
  const alertsToday = useDashboardStore((s) => s.data?.alertsToday) ?? 0;

  return (
    <div style={{ marginTop: 16, border: "1px solid #e9e7f2", borderRadius: 16, background: "#fff", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f3f0fd", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15v-4a6 6 0 10-12 0v4l-1.5 3h15L18 15z" /><path d="M10 21h4" /></svg>
      </div>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#3f3e52" }}>
        {loading ? (
          <span className="skeleton-text">You have 0 alerts that need your attention.</span>
        ) : (
          <span>You have {alertsToday} alert{alertsToday === 1 ? "" : "s"} that need your attention.</span>
        )}
      </span>
      <button
        onClick={() => navigate("/app/alert-history")}
        style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#6d4aff", whiteSpace: "nowrap", border: "none", background: "none", cursor: "pointer", padding: 0 }}
      >
        <span>View all alerts</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}
