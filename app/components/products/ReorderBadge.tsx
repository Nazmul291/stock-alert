export function ReorderBadge({ days, leadTime }: { days: number | null; leadTime: number }) {
  if (days === null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  if (days === 0) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;

  const daysUntilReorder = days - leadTime;

  if (daysUntilReorder <= 0) {
    return (
      <span style={{ background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
        Reorder now!
      </span>
    );
  }

  const reorderDate = new Date();
  reorderDate.setDate(reorderDate.getDate() + daysUntilReorder);
  const label = reorderDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isUrgent = daysUntilReorder <= 3;

  return (
    <span style={{
      background: isUrgent ? "#fef3c7" : "#f9fafb",
      color: isUrgent ? "#92400e" : "#374151",
      border: `1px solid ${isUrgent ? "#fde68a" : "#e5e7eb"}`,
      padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: isUrgent ? 600 : 400,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
