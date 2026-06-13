export type LocationInventory = { locationId: string; locationName: string; quantity: number };
export type VariantInventory = {
  id: string;
  title: string;
  sku: string | null;
  inventoryItemId: string | null;
  tracked: boolean;
  locations: LocationInventory[];
};

type Props = {
  variants: VariantInventory[];
  loading: boolean;
  error?: string;
  edits: Record<string, string>;
  expanded: Set<string>;
  onEdit: (key: string, val: string) => void;
  onToggleExpand: (id: string) => void;
};

export function InventorySection({ variants, loading, error, edits, expanded, onEdit, onToggleExpand }: Props) {
  if (loading) {
    return (
      <div style={{ padding: "20px 0", textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
        Loading inventory…
      </div>
    );
  }

  if (error) {
    return <div style={{ padding: "10px 0", color: "#991b1b", fontSize: 13 }}>{error}</div>;
  }

  const trackedVariants = variants.filter((v) => v.inventoryItemId);

  if (trackedVariants.length === 0) {
    return (
      <div style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, color: "#6b7280" }}>
        Inventory not managed by Shopify — quantities cannot be updated.
      </div>
    );
  }

  const isSimple = trackedVariants.length === 1 && (trackedVariants[0].title === "Default Title" || variants.length === 1);

  if (isSimple) {
    const variant = trackedVariants[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {variant.locations.length === 0 && (
          <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>No locations found.</p>
        )}
        {variant.locations.map((loc) => {
          const key = `${variant.inventoryItemId}__${loc.locationId}`;
          return (
            <div key={loc.locationId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{loc.locationName}</span>
              <input
                type="number"
                min="0"
                value={edits[key] ?? ""}
                onChange={(e) => onEdit(key, e.target.value)}
                placeholder="0"
                style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, textAlign: "right" }}
                aria-label={`Quantity at ${loc.locationName}`}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {trackedVariants.map((variant) => {
        const isOpen = expanded.has(variant.id);
        return (
          <div key={variant.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => onToggleExpand(variant.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: isOpen ? "#f3f4f6" : "#f9fafb", border: "none", cursor: "pointer", textAlign: "left" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{variant.title}</span>
                {variant.sku && (
                  <span style={{ fontSize: 11, color: "#9ca3af", background: "#e5e7eb", borderRadius: 4, padding: "1px 6px" }}>
                    {variant.sku}
                  </span>
                )}
              </div>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"
                style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .2s", flexShrink: 0 }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {isOpen && (
              <div style={{ padding: "8px 12px 10px", display: "flex", flexDirection: "column", gap: 6, background: "#fff" }}>
                {variant.locations.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>No locations found.</p>
                )}
                {variant.locations.map((loc) => {
                  const key = `${variant.inventoryItemId}__${loc.locationId}`;
                  return (
                    <div key={loc.locationId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{loc.locationName}</span>
                      <input
                        type="number"
                        min="0"
                        value={edits[key] ?? ""}
                        onChange={(e) => onEdit(key, e.target.value)}
                        placeholder="0"
                        style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13, textAlign: "right" }}
                        aria-label={`Quantity at ${loc.locationName}`}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
