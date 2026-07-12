import { useAnalyticsStore } from "../../stores/analytics-store";

// Reserves the list's shape while loading — the real titles/counts aren't
// known yet, so these render as neutral zero-width bars with skeleton-text
// placeholders over the title/count.
const DEFAULT_TOP_PRODUCTS = Array.from({ length: 5 }, () => ({ title: "Product name", count: 0 }));

export function TopProductsChart() {
  const loading = useAnalyticsStore((s) => s.data === null);
  const data = useAnalyticsStore((s) => s.data?.topProducts) ?? DEFAULT_TOP_PRODUCTS;
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d, i) => {
        const pct = Math.round((d.count / maxCount) * 100);
        return (
          <div key={`${d.title}-${i}`}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 13 }}>
              <span className={loading ? "skeleton-text" : undefined} style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                <span style={{ color: "#9ca3af", marginRight: 6, fontVariantNumeric: "tabular-nums" }}>#{i + 1}</span>
                {d.title ?? "Unknown"}
              </span>
              <span className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 700, color: "#111827", flexShrink: 0 }}>{d.count}</span>
            </div>
            <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3 }}>
              <div style={{ height: 6, background: i === 0 ? "#4f46e5" : "#a5b4fc", borderRadius: 3, width: `${pct}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
