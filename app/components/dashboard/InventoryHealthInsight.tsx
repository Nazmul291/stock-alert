import { useDashboardStore } from "../../stores/dashboard-store";

const DEFAULT_HEALTH = { pct: 0, label: "Good" as const, trend: { direction: null as null | "better" | "worse" | "same", deltaPts: null as number | null } };

// Purely decorative — the design reference's own hand-authored curve
// (its "gnote"/"gnoteline" gradients), reproduced verbatim rather than
// derived from statHistory. Per explicit direction: not meant to be a real
// chart, just the same clean visual as the reference file, recolored to
// match whichever state (better/worse/same/unknown) is showing.
const TREND_PATH = "M0 38 C18 36 30 32 46 28 C62 24 74 18 90 12 C102 8 112 6 120 5";

function HealthTrendSparkline({ color, gradientId }: { color: string; gradientId: string }) {
  const areaId = `${gradientId}-area`;
  const lineId = `${gradientId}-line`;
  return (
    <svg viewBox="0 0 120 44" preserveAspectRatio="none" style={{ position: "absolute", right: 0, bottom: 0, width: 132, height: 40 }}>
      <defs>
        <linearGradient id={areaId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.16} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
        <linearGradient id={lineId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity={0} />
          <stop offset="0.35" stopColor={color} stopOpacity={0.55} />
          <stop offset="1" stopColor={color} stopOpacity={0.75} />
        </linearGradient>
      </defs>
      <path d={`${TREND_PATH} L120 44 L0 44 Z`} fill={`url(#${areaId})`} />
      <path d={TREND_PATH} fill="none" stroke={`url(#${lineId})`} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

// Sits directly below InventoryHealthDonut, inside the same card — "better/
// worse than last week" framed from the same health-score trend. Always
// renders something (loading skeleton, then either the real comparison or a
// neutral "not enough data yet" note) rather than collapsing to nothing —
// the design reference always shows this strip, and disappearing entirely
// on a fresh install (no 7-day baseline) reads as a missing/broken section
// rather than an honestly-empty one.
export function InventoryHealthInsight() {
  const loading = useDashboardStore((s) => s.data === null);
  const health = useDashboardStore((s) => s.data?.health) ?? DEFAULT_HEALTH;

  if (loading) {
    return <div className="skeleton-text" style={{ height: 62, borderRadius: 14 }} />;
  }

  const { direction, deltaPts } = health.trend;

  const message =
    direction === "better"
      ? ["Your inventory health is better than last week.", "Keep it up! You're making great progress."]
      : direction === "worse"
      ? [`Your inventory health dipped ${Math.abs(deltaPts ?? 0)} point${Math.abs(deltaPts ?? 0) === 1 ? "" : "s"} from last week.`, "Worth a look."]
      : direction === "same"
      ? ["Your inventory health is about the same as last week."]
      : ["Not enough history yet to compare to last week.", "Check back in a few days."];

  const bg = direction === "better" ? "#f4fbf7" : direction === "worse" ? "#fdf5f5" : "#f9f9fb";
  const border = direction === "better" ? "#dcefe3" : direction === "worse" ? "#f6dede" : "#ecebf3";
  const iconBg = direction === "better" ? "#e2f5ea" : direction === "worse" ? "#fdeaea" : "#eeedf3";
  const color = direction === "better" ? "#27ae72" : direction === "worse" ? "#d63c3c" : "#6b6a80";
  const textColor = "#3f3e52";

  return (
    <div style={{ position: "relative", overflow: "hidden", border: `1px solid ${border}`, background: bg, borderRadius: 14, padding: "13px 14px", display: "flex", gap: 11, alignItems: "flex-start" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {direction === "better" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20c-4 0-7-3-7-7 0-5 5-9 15-9 0 10-4 15-9 15z" /><path d="M8 20c1-5 4-8 8-10" /></svg>
        ) : direction === "worse" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
        ) : direction === "same" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14" /></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
        )}
      </div>
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        {message.map((line) => (
          <div key={line} style={{ fontSize: 12.5, fontWeight: 600, color: textColor }}>{line}</div>
        ))}
      </div>
      {/* Same structure in every state, including "not enough history yet"
          — the curve is decorative (see above), so it's never missing. */}
      <HealthTrendSparkline color={color} gradientId={`health-insight-${direction ?? "none"}`} />
    </div>
  );
}
