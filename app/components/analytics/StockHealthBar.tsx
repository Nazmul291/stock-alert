import { useAnalyticsStore } from "../../stores/analytics-store";

const DEFAULT_HEALTH = { inStock: 0, lowStock: 0, outOfStock: 0, deactivated: 0 };

// Reserves the legend's shape while loading — these are the only stock
// health categories that exist, so the layout doesn't jump once data
// arrives.
const LOADING_SEGMENTS = [
  { label: "In Stock", count: 0, color: "#10b981" },
  { label: "Low Stock", count: 0, color: "#f59e0b" },
  { label: "Out of Stock", count: 0, color: "#ef4444" },
  { label: "Deactivated", count: 0, color: "#d1d5db" },
];

export function StockHealthBar() {
  const loading = useAnalyticsStore((s) => s.data === null);
  const health = useAnalyticsStore((s) => s.data?.stockHealth) ?? DEFAULT_HEALTH;
  const total = health.inStock + health.lowStock + health.outOfStock + health.deactivated;
  // Genuinely-empty state — loading has its own visual state below, so this
  // only appears once data has confirmed there's nothing.
  if (!loading && total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No products tracked yet.</p>;

  const segments = loading
    ? LOADING_SEGMENTS
    : [
        { label: "In Stock",    count: health.inStock,    color: "#10b981" },
        { label: "Low Stock",   count: health.lowStock,   color: "#f59e0b" },
        { label: "Out of Stock",count: health.outOfStock, color: "#ef4444" },
        { label: "Deactivated", count: health.deactivated,color: "#d1d5db" },
      ].filter((s) => s.count > 0);

  return (
    <div>
      {/* Stacked bar — a single neutral placeholder while loading, since the
          real segments are proportional and all-zero counts would render
          nothing at all rather than a neutral/empty bar. */}
      <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        {loading ? (
          <div className="skeleton-text" style={{ flex: 1 }} />
        ) : (
          segments.map((s) => (
            <div
              key={s.label}
              title={`${s.label}: ${s.count}`}
              style={{ flex: s.count, background: s.color, transition: "flex 0.3s" }}
            />
          ))
        )}
      </div>
      {/* Legend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "8px 16px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#374151" }}>{s.label}</span>
            <span className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 700, color: "#111827", marginLeft: "auto" }}>{s.count}</span>
            <span className={loading ? "skeleton-text" : undefined} style={{ fontSize: 12, color: "#9ca3af" }}>{loading ? 0 : Math.round((s.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
