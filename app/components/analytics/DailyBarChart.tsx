export function DailyBarChart({ data }: { data: { day: string; count: number }[] }) {
  const BAR_W = 16;
  const GAP   = 4;
  const BAR_H = 64;
  const LABEL_H = 18;
  const total = data.length;
  const svgW = total * (BAR_W + GAP) - GAP;
  const svgH = BAR_H + LABEL_H;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <svg width={svgW} height={svgH} style={{ display: "block", minWidth: svgW }}>
        {data.map((d, i) => {
          const x = i * (BAR_W + GAP);
          const barH = d.count === 0 ? 2 : Math.max(4, Math.round((d.count / max) * BAR_H));
          const y = BAR_H - barH;
          const isToday = i === data.length - 1;
          const isWeekend = [0, 6].includes(new Date(d.day + "T00:00:00Z").getUTCDay());
          const fill   = d.count === 0 ? "#f3f4f6" : isToday ? "#4f46e5" : "#a5b4fc";
          const stroke = d.count === 0 ? "#e5e7eb" : isToday ? "#3730a3" : "#818cf8";

          // Show day-of-month label every 5 bars and on first/last
          const date = new Date(d.day + "T00:00:00Z");
          const showLabel = i === 0 || i === data.length - 1 || date.getUTCDate() % 5 === 0;
          const labelText = showLabel ? date.getUTCDate().toString() : "";

          return (
            <g key={d.day}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx={2} fill={fill} stroke={stroke} strokeWidth={1}>
                <title>{d.day}: {d.count} alert{d.count !== 1 ? "s" : ""}</title>
              </rect>
              {d.count > 0 && d.count === max && (
                <text x={x + BAR_W / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="#374151" fontWeight={600}>
                  {d.count}
                </text>
              )}
              {labelText && (
                <text x={x + BAR_W / 2} y={BAR_H + 13} textAnchor="middle" fontSize={9} fill={isWeekend ? "#d1d5db" : "#9ca3af"}>
                  {labelText}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#4f46e5", borderRadius: 2, display: "inline-block" }} /> Today
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#a5b4fc", borderRadius: 2, display: "inline-block" }} /> Previous days
        </span>
      </div>
    </div>
  );
}
