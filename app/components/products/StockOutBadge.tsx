import { StatusPill } from "../StatusPill";

export function StockOutBadge({ days, isManual }: { days: number | null; isManual?: boolean }) {
  if (days === null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  const title = isManual ? "Based on manual daily sales rate" : "Based on 30-day sales average";
  if (days === 0) return <StatusPill label="0d" bg="#fee2e2" color="#991b1b" title={title} />;
  const bg    = days < 7  ? "#fee2e2" : days < 14 ? "#fef3c7" : "#d1fae5";
  const color = days < 7  ? "#991b1b" : days < 14 ? "#92400e" : "#065f46";
  return <StatusPill label={`~${days}d${isManual ? " ✎" : ""}`} bg={bg} color={color} title={title} />;
}
