import { useDashboardStore } from "../../stores/dashboard-store";

export function AlertSparkline() {
  const data = useDashboardStore((s) => s.data!.spark7);
  const BAR_W = 28;
  const GAP = 6;
  const BAR_H = 44;
  const LABEL_H = 16;
  const total = data.length; // always 7
  const svgW = total * BAR_W + (total - 1) * GAP;
  const svgH = BAR_H + LABEL_H;
  const max = Math.max(...data, 1);
  const totalAlerts = data.reduce((a, b) => a + b, 0);

  // Day labels: Mon/Tue/... for each of the 7 days
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
  });

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Alerts — last 7 days</span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{totalAlerts} total</span>
      </div>
      <svg width={svgW} height={svgH} style={{ display: "block", overflow: "visible" }}>
        {data.map((count, i) => {
          const x = i * (BAR_W + GAP);
          const barH = count === 0 ? 2 : Math.max(4, Math.round((count / max) * BAR_H));
          const y = BAR_H - barH;
          const isToday = i === 6;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={BAR_W} height={barH}
                rx={3}
                fill={count === 0 ? "#f3f4f6" : isToday ? "#d97706" : "#fde68a"}
                stroke={count === 0 ? "#e5e7eb" : isToday ? "#b45309" : "#f59e0b"}
                strokeWidth={1}
              />
              {count > 0 && (
                <text x={x + BAR_W / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="#6b7280">{count}</text>
              )}
              <text x={x + BAR_W / 2} y={svgH - 1} textAnchor="middle" fontSize={9} fill={isToday ? "#374151" : "#9ca3af"} fontWeight={isToday ? 700 : 400}>
                {days[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
