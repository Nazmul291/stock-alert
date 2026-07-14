export function SalesVelocityBadge({ unitsPerDay, isManual }: { unitsPerDay: number | null; isManual?: boolean }) {
  if (unitsPerDay === null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  return (
    <span style={{ color: "#374151", fontSize: 13, whiteSpace: "nowrap" }}
      title={isManual ? "Based on manual daily sales rate" : "Based on 30-day sales average"}>
      {unitsPerDay.toFixed(2)} / Day{isManual ? " ✎" : ""}
    </span>
  );
}
