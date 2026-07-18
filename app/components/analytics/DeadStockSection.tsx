import { useAnalyticsStore } from "../../stores/analytics-store";

export function DeadStockSection() {
  const plan = useAnalyticsStore((s) => s.data?.plan);
  const data = useAnalyticsStore((s) => s.data?.deadStock);

  if (plan && plan !== "enterprise") {
    return (
      <div style={{ textAlign: "center", padding: "24px 20px", color: "#6b7280" }}>
        <p style={{ fontSize: 15, marginBottom: 6, color: "#111827", fontWeight: 600 }}>
          Dead stock alerts are an Enterprise plan feature.
        </p>
        <p style={{ fontSize: 13, marginBottom: 16 }}>
          Surface products that are still in stock but haven&apos;t sold in weeks, so you can stop tying up capital in them.
        </p>
        {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
        <s-button variant="primary" href="/app/billing" suppressHydrationWarning>Upgrade to Enterprise</s-button>
      </div>
    );
  }

  if (!data) return <p style={{ fontSize: 14, color: "#9ca3af" }}>Loading…</p>;

  if (data.count === 0) {
    return <p style={{ fontSize: 14, color: "#9ca3af" }}>No dead stock right now — nice.</p>;
  }

  return (
    <div>
      <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
        <strong style={{ color: "#111827" }}>{data.count}</strong> product{data.count === 1 ? "" : "s"} with no sales in at least{" "}
        {data.thresholdDays} days. Change the threshold on <s-link href="/app/settings">Settings</s-link>.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {data.items.map((item) => (
          <div
            key={item.productId}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 10px", background: "#fafafa", borderRadius: 6, border: "1px solid #f0f0f0" }}
          >
            <span style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.productTitle ?? "Unknown"}
            </span>
            <span style={{ display: "flex", gap: 14, flexShrink: 0, fontSize: 12, color: "#6b7280" }}>
              <span>{item.quantity} in stock</span>
              <span style={{ fontWeight: 600, color: "#92400e" }}>{item.daysSinceZeroSales}d dead</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
