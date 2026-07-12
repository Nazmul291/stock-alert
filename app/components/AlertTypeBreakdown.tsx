import { SkeletonBlock } from "./Skeleton";

const TYPE_COLORS: Record<string, { color: string; label: string }> = {
  low_stock:    { color: "#f59e0b", label: "Low Stock" },
  out_of_stock: { color: "#ef4444", label: "Out of Stock" },
  restock:      { color: "#10b981", label: "Restock" },
};

export function AlertTypeBreakdown({ data, total }: { data: { type: string; count: number }[]; total: number }) {
  if (total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No data yet.</p>;

  const R = 46;
  const CX = 56;
  const CY = 56;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  const segments = data.map((d) => {
    const frac = d.count / total;
    const dash = frac * circumference;
    const seg = { ...d, dash, offset, frac };
    offset += dash;
    return seg;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={112} height={112} viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f3f4f6" strokeWidth={18} />
        {segments.map((s) => {
          const c = TYPE_COLORS[s.type]?.color ?? "#9ca3af";
          return (
            <circle
              key={s.type}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={c}
              strokeWidth={18}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset + circumference / 4}
              style={{ transition: "stroke-dasharray 0.3s" }}
            />
          );
        })}
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight={700} fill="#111827">
          {total}
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#6b7280">
          total
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((d) => {
          const meta = TYPE_COLORS[d.type] ?? { color: "#9ca3af", label: d.type };
          const pct = Math.round((d.count / total) * 100);
          return (
            <div key={d.type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#374151" }}>{meta.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginLeft: "auto", paddingLeft: 12 }}>{d.count}</span>
              <span style={{ fontSize: 12, color: "#9ca3af", width: 32, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AlertTypeBreakdownSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <SkeletonBlock width={112} height={112} borderRadius={56} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} width={120} height={14} />)}
      </div>
    </div>
  );
}
