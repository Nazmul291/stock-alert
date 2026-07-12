import type { AnalyticsData } from "../../lib/analytics-data.server";
import { SkeletonBlock } from "../Skeleton";

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#374151", marginTop: 4, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function AnalyticsStatCards({ data }: { data: AnalyticsData }) {
  const { totalThisMonth, totalLastMonth, avgPerDay, busiest } = data;
  const pctChange = totalLastMonth === 0
    ? null
    : Math.round(((totalThisMonth - totalLastMonth) / totalLastMonth) * 100);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12, marginBottom: 24 }}>
      <StatCard label="Alerts (30 days)" value={totalThisMonth} color="#4f46e5" />
      <StatCard
        label="vs Previous 30 days"
        value={pctChange === null ? "—" : `${pctChange >= 0 ? "+" : ""}${pctChange}%`}
        color={pctChange === null ? "#9ca3af" : pctChange > 0 ? "#dc2626" : "#059669"}
        sub={`${totalLastMonth} last period`}
      />
      <StatCard label="Avg alerts / day" value={avgPerDay.toFixed(1)} color="#374151" />
      <StatCard
        label="Busiest day"
        value={busiest.count === 0 ? "—" : busiest.count}
        color="#d97706"
        sub={busiest.day ? new Date(busiest.day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ""}
      />
    </div>
  );
}

export function AnalyticsStatCardsSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12, marginBottom: 24 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
          <SkeletonBlock width={56} height={28} style={{ marginBottom: 8 }} />
          <SkeletonBlock width={100} height={13} />
        </div>
      ))}
    </div>
  );
}
