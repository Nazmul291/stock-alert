export function StockOutBadge({ days, isManual }: { days: number | null; isManual?: boolean }) {
  if (days === null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  if (days === 0) return (
    <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
      0d
    </span>
  );
  const bg    = days < 7  ? "#fee2e2" : days < 14 ? "#fef3c7" : "#d1fae5";
  const color = days < 7  ? "#991b1b" : days < 14 ? "#92400e" : "#065f46";
  return (
    <span style={{ background: bg, color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
      title={isManual ? "Based on manual daily sales rate" : "Based on 30-day sales average"}>
      ~{days}d{isManual ? " ✎" : ""}
    </span>
  );
}
