import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";
import { useDashboardStore } from "../../stores/dashboard-store";

export function ReadyForReorderBanner() {
  const navigate = useShopAwareNavigate();
  const loading = useDashboardStore((s) => s.data === null);
  const count = useDashboardStore((s) => s.data?.readyForReorderCount) ?? 0;

  return (
    <div style={{ marginTop: 16, padding: "12px 16px", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>📋</span>
        <div>
          <span className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 700, color: "#3730a3", fontSize: 14 }}>
            {count} product{count !== 1 ? "s" : ""} ready to reorder from suppliers
          </span>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#4338ca" }}>
            Based on your stockout forecast and supplier lead times.
          </p>
        </div>
      </div>
      <button onClick={() => navigate("/app/purchase-orders")} style={{ fontSize: 13, fontWeight: 600, color: "#3730a3", whiteSpace: "nowrap", border: "1px solid #c7d2fe", borderRadius: 6, padding: "6px 12px", background: "#fff", cursor: "pointer" }}>
        Create purchase order →
      </button>
    </div>
  );
}
