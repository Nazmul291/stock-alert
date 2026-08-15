function statCard(label: string, value: number | string, color: string) {
  return (
    <div key={label} style={{ flex: 1, minWidth: 140, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 20px" }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// Plain props, not a store — this page has no SSE/background-refresh, and
// the totals here are meant to live-update from the merchant's in-page
// selection/quantity edits (computed by the route component from lifted
// state), not from a separate data source of their own.
export function ReorderPlannerStatCards({
  totalToReorder,
  productsNeedingReorder,
  avgLeadTimeDays,
  suppliersActive,
}: {
  totalToReorder: number;
  productsNeedingReorder: number;
  avgLeadTimeDays: number;
  suppliersActive: number;
}) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
      {statCard("Total to Reorder", `${totalToReorder.toLocaleString()} units`, "#111827")}
      {statCard("Products Need Reordering", productsNeedingReorder, "#d97706")}
      {statCard("Avg. Lead Time", `${avgLeadTimeDays} days`, "#4f46e5")}
      {statCard("Suppliers Active", suppliersActive, "#059669")}
    </div>
  );
}
