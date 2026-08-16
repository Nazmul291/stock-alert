import { useDashboardStore } from "../../stores/dashboard-store";

const DEFAULT_STATS = { totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0, hidden: 0, deactivated: 0, requiresUpgrade: 0 };
const DEFAULT_HEALTH = { pct: 0, label: "Good" as const };

// Same hand-rolled stroke-dasharray donut technique as
// AlertTypeBreakdown.tsx (Analytics page), adapted for inventory status
// instead of alert type. The ring itself only ever draws 3 mutually-exclusive
// segments (Healthy/Low Stock/Out of Stock, which already sum to
// stats.totalProducts) — Dead Stock is a different axis (no sales in N days
// despite having stock, see dead-stock.server.ts) that can overlap a
// "Healthy" or "Low Stock" product, so it's listed as its own row below
// rather than a 4th arc slice, which would double-count units and make the
// ring's percentages add up to more than 100%.
export function InventoryHealthDonut() {
  const loading = useDashboardStore((s) => s.data === null);
  const stats = useDashboardStore((s) => s.data?.stats) ?? DEFAULT_STATS;
  const health = useDashboardStore((s) => s.data?.health) ?? DEFAULT_HEALTH;
  const deadStockCount = useDashboardStore((s) => s.data?.deadStockCount) ?? 0;

  const total = stats.totalProducts;

  if (!loading && total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No products tracked yet.</p>;

  const segments = [
    { label: "Healthy", count: stats.inStock, color: "#33bd7c" },
    { label: "Low Stock", count: stats.lowStock, color: "#f0a12a" },
    { label: "Out of Stock", count: stats.outOfStock, color: "#ee4f4f" },
  ];

  const R = 70;
  const CX = 86;
  const CY = 86;
  const circumference = 2 * Math.PI * R;
  const safeTotal = total || 1;
  let runningOffset = 0;
  const arcs = segments.map((s) => {
    const dash = (s.count / safeTotal) * circumference;
    const arc = { ...s, dash, offset: runningOffset };
    runningOffset += dash;
    return arc;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: 172, height: 172, flexShrink: 0 }}>
        <svg width={172} height={172} viewBox="0 0 172 172">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f4f3f8" strokeWidth={19} />
          {arcs.map((s) => (
            <circle
              key={s.label}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={19}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset + circumference / 4}
              style={{ transition: "stroke-dasharray 0.3s" }}
            />
          ))}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <div style={{ fontSize: 31, fontWeight: 800, letterSpacing: "-1px", color: "#15151f" }}>{health.pct}%</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: health.label === "Good" ? "#33bd7c" : health.label === "Fair" ? "#f0a12a" : "#ee4f4f" }}>{health.label}</div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 140 }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "#3f3e52" }}>{s.label}</span>
            <span className={loading ? "skeleton-text" : undefined} style={{ fontSize: 13.5, fontWeight: 700, color: "#15151f" }}>{s.count}</span>
          </div>
        ))}
        {/* Not an arc slice — see note above. Always shown, 0 included, so
            the row never looks like it's missing. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#9a99a9", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: "#9a99a9" }}>Dead Stock</span>
          <span className={loading ? "skeleton-text" : undefined} style={{ fontSize: 13.5, fontWeight: 700, color: "#9a99a9" }}>{deadStockCount}</span>
        </div>
      </div>
    </div>
  );
}
