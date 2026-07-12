import { useAnalyticsStore } from "../../stores/analytics-store";

export function StockHealthBar() {
  const health = useAnalyticsStore((s) => s.data!.stockHealth);
  const total = health.inStock + health.lowStock + health.outOfStock + health.deactivated;
  if (total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No products tracked yet.</p>;

  const segments = [
    { label: "In Stock",    count: health.inStock,    color: "#10b981" },
    { label: "Low Stock",   count: health.lowStock,   color: "#f59e0b" },
    { label: "Out of Stock",count: health.outOfStock, color: "#ef4444" },
    { label: "Deactivated", count: health.deactivated,color: "#d1d5db" },
  ].filter((s) => s.count > 0);

  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        {segments.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.count}`}
            style={{ flex: s.count, background: s.color, transition: "flex 0.3s" }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "8px 16px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#374151" }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: "#111827", marginLeft: "auto" }}>{s.count}</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{Math.round((s.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
