import { useBackInStockStore } from "../../stores/back-in-stock-store";

function statCard(label: string, value: number | string, color: string, loading: boolean) {
  return (
    <div key={label} style={{ flex: 1, minWidth: 120, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
      <div className={loading ? "skeleton-text" : undefined} style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function BackInStockStatCards() {
  const loading = useBackInStockStore((s) => s.data === null);
  const total = useBackInStockStore((s) => s.data?.total) ?? 0;
  const pendingCount = useBackInStockStore((s) => s.data?.pendingCount) ?? 0;
  const notifiedCount = useBackInStockStore((s) => s.data?.notifiedCount) ?? 0;
  const productGroupCount = useBackInStockStore((s) => s.data?.productGroups.length) ?? 0;

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      {statCard("Total Subscribers", total, "#111827", loading)}
      {statCard("Waiting", pendingCount, "#d97706", loading)}
      {statCard("Notified", notifiedCount, "#059669", loading)}
      {statCard("Products Watched", productGroupCount, "#4f46e5", loading)}
    </div>
  );
}
