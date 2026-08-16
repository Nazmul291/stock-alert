import { StatusPill } from "../StatusPill";

// isOutOfStock covers the case previewPurchaseOrders now also includes:
// an already-out-of-stock product with no sales history, where days is
// null (no rate to predict from) rather than 0 — but it's no less urgent
// than a product that hit 0 with a known rate (days === 0, same case).
export function ReorderBadge({ days, leadTime, isOutOfStock }: { days: number | null; leadTime: number; isOutOfStock?: boolean }) {
  if (isOutOfStock || days === 0) {
    return <StatusPill label="Reorder now!" bg="#fee2e2" color="#991b1b" style={{ fontWeight: 700 }} />;
  }
  if (days === null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;

  const daysUntilReorder = days - leadTime;

  if (daysUntilReorder <= 0) {
    return <StatusPill label="Reorder now!" bg="#fee2e2" color="#991b1b" style={{ fontWeight: 700 }} />;
  }

  const reorderDate = new Date();
  reorderDate.setDate(reorderDate.getDate() + daysUntilReorder);
  const label = reorderDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isUrgent = daysUntilReorder <= 3;

  return (
    <StatusPill
      label={label}
      bg={isUrgent ? "#fef3c7" : "#f9fafb"}
      color={isUrgent ? "#92400e" : "#374151"}
      style={{ border: `1px solid ${isUrgent ? "#fde68a" : "#e5e7eb"}`, fontWeight: isUrgent ? 600 : 400 }}
    />
  );
}
