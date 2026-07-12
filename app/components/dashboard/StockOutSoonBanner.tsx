import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";

export function StockOutSoonBanner({ count }: { count: number }) {
  const navigate = useShopAwareNavigate();

  return (
    <div style={{ marginTop: 16, padding: "12px 16px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 20 }}>⏱️</span>
        <div>
          <span style={{ fontWeight: 700, color: "#92400e", fontSize: 14 }}>
            {count} product{count !== 1 ? "s" : ""} will stock out within 7 days
          </span>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#78350f" }}>
            Based on your 30-day sales velocity. Run a sync to refresh predictions.
          </p>
        </div>
      </div>
      <button onClick={() => navigate("/app/products")} style={{ fontSize: 13, fontWeight: 600, color: "#92400e", whiteSpace: "nowrap", border: "1px solid #fed7aa", borderRadius: 6, padding: "6px 12px", background: "#fff", cursor: "pointer" }}>
        View products →
      </button>
    </div>
  );
}
