import type { BackInStockData } from "../../lib/back-in-stock-data.server";
import { SkeletonBlock } from "../Skeleton";

function statCard(label: string, value: number | string, color: string) {
  return (
    <div key={label} style={{ flex: 1, minWidth: 120, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export function BackInStockStatCards({ data }: { data: BackInStockData }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      {statCard("Total Subscribers", data.total, "#111827")}
      {statCard("Waiting", data.pendingCount, "#d97706")}
      {statCard("Notified", data.notifiedCount, "#059669")}
      {statCard("Products Watched", data.productGroups.length, "#4f46e5")}
    </div>
  );
}

export function BackInStockStatCardsSkeleton() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ flex: 1, minWidth: 120, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
          <SkeletonBlock width={48} height={26} style={{ marginBottom: 6 }} />
          <SkeletonBlock width={90} height={13} />
        </div>
      ))}
    </div>
  );
}
