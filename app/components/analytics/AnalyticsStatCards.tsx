import { useAnalyticsStore } from "../../stores/analytics-store";

const DEFAULT_STATS = {
  totalThisMonth: 0, totalLastMonth: 0, avgPerDay: 0, busiest: { day: "", count: 0 },
};

function StatCard({ label, value, color, sub, loading }: { label: string; value: string | number; color: string; sub?: string; loading: boolean }) {
  return (
    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
      <span
        className={loading ? "skeleton-text" : undefined}
        style={{ display: "inline-block", minWidth: loading ? 56 : undefined, fontSize: 28, fontWeight: 700, color }}
      >
        {value}
      </span>
      <div style={{ fontSize: 13, color: "#374151", marginTop: 4, fontWeight: 500 }}>{label}</div>
      {/* Reserved during loading even when the real sub-text would otherwise
          be empty (e.g. "Busiest day" has no sub until a date resolves), so
          the card doesn't grow once data arrives. */}
      {(loading || sub) && (
        <span
          className={loading ? "skeleton-text" : undefined}
          style={{ display: "inline-block", minWidth: loading ? 72 : undefined, fontSize: 12, color: "#9ca3af", marginTop: 2 }}
        >
          {sub || " "}
        </span>
      )}
    </div>
  );
}

export function AnalyticsStatCards() {
  const loading = useAnalyticsStore((s) => s.data === null);
  const { totalThisMonth, totalLastMonth, avgPerDay, busiest } = useAnalyticsStore((s) => s.data) ?? DEFAULT_STATS;
  const pctChange = totalLastMonth === 0
    ? null
    : Math.round(((totalThisMonth - totalLastMonth) / totalLastMonth) * 100);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12, marginBottom: 24 }}>
      <StatCard label="Alerts (30 days)" value={totalThisMonth} color="#4f46e5" loading={loading} />
      <StatCard
        label="vs Previous 30 days"
        value={pctChange === null ? "—" : `${pctChange >= 0 ? "+" : ""}${pctChange}%`}
        color={pctChange === null ? "#9ca3af" : pctChange > 0 ? "#dc2626" : "#059669"}
        sub={`${totalLastMonth} last period`}
        loading={loading}
      />
      <StatCard label="Avg alerts / day" value={avgPerDay.toFixed(1)} color="#374151" loading={loading} />
      <StatCard
        label="Busiest day"
        value={busiest.count === 0 ? "—" : busiest.count}
        color="#d97706"
        sub={busiest.day ? new Date(busiest.day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ""}
        loading={loading}
      />
    </div>
  );
}
