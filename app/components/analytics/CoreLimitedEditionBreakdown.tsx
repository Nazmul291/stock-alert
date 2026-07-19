import { useAnalyticsStore } from "../../stores/analytics-store";

const DEFAULT_HEALTH = { inStock: 0, lowStock: 0, outOfStock: 0, deactivated: 0 };

// Same segment colors as StockHealthBar.tsx, deliberately duplicated rather
// than shared — this renders two small bars side by side instead of one
// full-width one, and the two components' loading/empty states differ
// enough (this one gates on plan first) that factoring out a shared
// sub-component isn't worth it for ~15 lines of markup. Worth revisiting if
// a third bar like this shows up.
function MiniHealthBar({ label, health }: { label: string; health: typeof DEFAULT_HEALTH }) {
  const total = health.inStock + health.lowStock + health.outOfStock + health.deactivated;
  const segments = [
    { key: "inStock", label: "In Stock", count: health.inStock, color: "#10b981" },
    { key: "lowStock", label: "Low Stock", count: health.lowStock, color: "#f59e0b" },
    { key: "outOfStock", label: "Out of Stock", count: health.outOfStock, color: "#ef4444" },
    { key: "deactivated", label: "Deactivated", count: health.deactivated, color: "#d1d5db" },
  ].filter((s) => s.count > 0);

  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{label}</p>
      {total === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af" }}>No products in this group.</p>
      ) : (
        <>
          <div style={{ display: "flex", height: 16, borderRadius: 6, overflow: "hidden", marginBottom: 10 }}>
            {segments.map((s) => (
              <div key={s.key} title={`${s.label}: ${s.count}`} style={{ flex: s.count, background: s.color, transition: "flex 0.3s" }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {segments.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <span style={{ color: "#6b7280" }}>{s.label}</span>
                <span style={{ fontWeight: 700, color: "#111827", marginLeft: "auto" }}>{s.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function CoreLimitedEditionBreakdown() {
  const plan = useAnalyticsStore((s) => s.data?.plan);
  const data = useAnalyticsStore((s) => s.data?.coreLimitedEdition);

  if (plan && plan !== "enterprise") {
    return (
      <div style={{ textAlign: "center", padding: "24px 20px", color: "#6b7280" }}>
        <p style={{ fontSize: 15, marginBottom: 6, color: "#111827", fontWeight: 600 }}>
          Core vs. Limited-Edition report sections are an Enterprise plan feature.
        </p>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          Split your stock-health breakdown by a product tag you choose, so limited-run drops don&apos;t skew your core catalog&apos;s numbers.
        </p>
        {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
        <s-button variant="primary" href="/app/billing" suppressHydrationWarning>Upgrade to Enterprise</s-button>
      </div>
    );
  }

  if (!data) return <p style={{ fontSize: 14, color: "#9ca3af" }}>Loading…</p>;

  return (
    <div>
      <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 0, marginBottom: 16 }}>
        Products tagged <strong>{data.tag}</strong> are &quot;Limited-Edition&quot;; everything else is &quot;Core&quot;. Change the tag on{" "}
        <s-link href="/app/settings">Settings</s-link>.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <MiniHealthBar label="Core" health={data.core} />
        <MiniHealthBar label="Limited-Edition" health={data.limitedEdition} />
      </div>
    </div>
  );
}
