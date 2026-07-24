import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { ProductDetailVariantForPo } from "../../lib/product-detail.server";

type SupplierOption = { id: string; name: string };
type CreatePOResult = { success: boolean; error?: string; purchaseOrderId?: string };

const NO_LOCATION = "__none__";

// One quantity field per (variant, location) pair so a variant stocked at
// several locations can be ordered with a different quantity for each —
// keyed the same way InventorySection.tsx keys its per-location edits
// (`${id}__${locationId}`), just with variantId in place of inventoryItemId.
function lineKey(variantId: string, locationId: string | null) {
  return `${variantId}__${locationId ?? NO_LOCATION}`;
}

export function ProductCreatePoCard({
  variants,
  suppliers,
  defaultSupplierId,
}: {
  variants: ProductDetailVariantForPo[];
  suppliers: SupplierOption[];
  defaultSupplierId: string | null;
}) {
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of variants) {
      if (v.locations.length > 1) {
        // No smart auto-split across locations — a guessed distribution is
        // likely wrong, so every location starts at 0 and the merchant fills
        // in what they actually need.
        for (const loc of v.locations) initial[lineKey(v.variantId, loc.locationId)] = "0";
      } else {
        const locationId = v.locations[0]?.locationId ?? null;
        initial[lineKey(v.variantId, locationId)] = String(Math.max(v.suggestedQuantity, 0));
      }
    }
    return initial;
  });
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const v of variants) initial[v.variantId] = v.unitCost != null ? String(v.unitCost) : "";
    return initial;
  });

  const createFetcher = useFetcher<CreatePOResult>();
  const creating = createFetcher.state !== "idle";

  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.success && createFetcher.data.purchaseOrderId) {
      navigate(`/app/purchase-orders/${createFetcher.data.purchaseOrderId}`);
    }
  }, [createFetcher.state, createFetcher.data, navigate]);

  const hasValidLine = Object.values(quantities).some((q) => (parseInt(q) || 0) > 0);
  const canSubmit = !!supplierId && hasValidLine && !creating;

  function handleCreate() {
    const submitLines: Array<{ variantId: string; quantityOrdered: number; unitCost: number | null; locationId: string | null; locationName: string | null }> = [];
    for (const v of variants) {
      const rawUnitCost = unitCosts[v.variantId] ?? "";
      const unitCost = rawUnitCost.trim() !== "" && !isNaN(parseFloat(rawUnitCost)) ? parseFloat(rawUnitCost) : null;
      const locationEntries = v.locations.length > 0 ? v.locations : [{ locationId: null as string | null, locationName: null as string | null, available: v.currentQuantity }];
      for (const loc of locationEntries) {
        const quantityOrdered = parseInt(quantities[lineKey(v.variantId, loc.locationId)] ?? "0") || 0;
        if (quantityOrdered <= 0) continue;
        submitLines.push({ variantId: v.variantId, quantityOrdered, unitCost, locationId: loc.locationId, locationName: loc.locationName });
      }
    }
    createFetcher.submit({ intent: "create_po", supplierId, lines: JSON.stringify(submitLines) }, { method: "post" });
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 18 }}>
      <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 15, color: "#111827" }}>Create Purchase Order</p>

      {createFetcher.data && !createFetcher.data.success && (
        <div style={{ marginBottom: 10, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", color: "#991b1b", fontSize: 13 }}>
          {createFetcher.data.error}
        </div>
      )}

      {suppliers.length === 0 ? (
        <p style={{ fontSize: 13, color: "#9ca3af" }}>Add a supplier first to create a purchase order for this product.</p>
      ) : (
        <>
          <label htmlFor="po-supplier-select" style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Supplier</label>
          <select
            id="po-supplier-select"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, marginBottom: 14 }}
          >
            <option value="">Select a supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {variants.map((v) => (
              <div key={v.variantId} style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: v.locations.length > 1 ? 8 : 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                    {v.variantTitle ?? "Default"}
                    {v.sku && <span style={{ fontWeight: 400, color: "#9ca3af" }}> · {v.sku}</span>}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Unit cost</span>
                    <input
                      type="number" min={0} step={0.01}
                      value={unitCosts[v.variantId] ?? ""}
                      onChange={(e) => setUnitCosts((prev) => ({ ...prev, [v.variantId]: e.target.value }))}
                      style={{ width: 70, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                    />
                  </div>
                </div>

                {v.locations.length > 1 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {v.locations.map((loc) => {
                      const key = lineKey(v.variantId, loc.locationId);
                      return (
                        <div key={loc.locationId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>
                            {loc.locationName} <span style={{ color: "#9ca3af" }}>({loc.available} available)</span>
                          </span>
                          <input
                            type="number" min={0}
                            value={quantities[key] ?? "0"}
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                            style={{ width: 70, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                            aria-label={`Quantity to order at ${loc.locationName}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 12, color: "#6b7280" }}>{v.currentQuantity} in stock</span>
                    <input
                      type="number" min={0}
                      value={quantities[lineKey(v.variantId, v.locations[0]?.locationId ?? null)] ?? "0"}
                      onChange={(e) => setQuantities((prev) => ({ ...prev, [lineKey(v.variantId, v.locations[0]?.locationId ?? null)]: e.target.value }))}
                      style={{ width: 70, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                      aria-label={`Quantity to order for ${v.variantTitle ?? "this variant"}`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <button
            type="button" onClick={handleCreate} disabled={!canSubmit}
            style={{ marginTop: 14, padding: "8px 16px", borderRadius: 8, border: "none", background: canSubmit ? "#111827" : "#9ca3af", color: "#fff", cursor: canSubmit ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 600 }}
          >
            {creating ? "Creating…" : "Create Purchase Order"}
          </button>
        </>
      )}
    </div>
  );
}
