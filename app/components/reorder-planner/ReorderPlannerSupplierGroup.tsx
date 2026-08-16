import { useState } from "react";
import { Link } from "react-router";
import type { SupplierPreview } from "../../lib/purchase-order.server";
import { SalesVelocityBadge } from "../products/SalesVelocityBadge";
import { StockOutBadge } from "../products/StockOutBadge";
import { ReorderBadge } from "../products/ReorderBadge";
import { CreatePurchaseOrderModal, type CandidateRow } from "../purchase-orders/CreatePurchaseOrderModal";

// Mirrors the same clamp `sanitizeQuantity` applies server-side
// (purchase-order.server.ts) — can't import that here, it's a *.server.ts
// module and this component runs in the browser. The server re-clamps on
// submit regardless, so this is purely for a sane live display.
function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

// One supplier's reorder section: its own table, its own selection/qty
// state slice (owned by the parent route — see qtyByVariant/checked below),
// its own subtotal bar, and its own "Create Purchase Order" button. A PO can
// only have one supplier (schema constraint), so this is the unit of action
// on the page — there is no page-wide "create POs for everything" button.
export function ReorderPlannerSupplierGroup({
  group,
  suppliers,
  locations,
  qtyByVariant,
  checked,
  onToggleChecked,
  onQtyChange,
}: {
  group: SupplierPreview;
  suppliers: { id: string; name: string; paymentTerms: string | null }[];
  locations: { id: string; name: string }[];
  qtyByVariant: Record<string, number>;
  checked: Set<string>;
  onToggleChecked: (variantId: string) => void;
  onQtyChange: (variantId: string, value: number) => void;
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const checkedLines = group.lines.filter((l) => checked.has(l.variantId));
  const subtotalUnits = checkedLines.reduce((sum, l) => sum + (qtyByVariant[l.variantId] ?? 0), 0);

  // No `productId` — every row here already has this group's supplier as
  // its InventoryTracking.supplierId (that's the only reason
  // previewPurchaseOrders put it in this group), so there's no single
  // product's "supplier of record" to (re)assign on submit. See
  // CreatePurchaseOrderModal's preselect.productId doc comment.
  const candidateRows: CandidateRow[] = checkedLines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    productTitle: l.productTitle,
    variantTitle: l.variantTitle,
    sku: l.sku,
    imageUrl: l.imageUrl,
    imageAlt: l.imageAlt,
    currentQuantity: l.currentQuantity,
    suggestedQuantity: qtyByVariant[l.variantId] ?? l.suggestedQuantity,
    unitCost: l.unitCost,
    price: l.price,
    compareAtPrice: l.compareAtPrice,
  }));

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #f3f4f6" }}>
        <span style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>{group.supplierName}</span>
        <span style={{ marginLeft: 10, fontSize: 13, color: "#6b7280" }}>Lead time: {group.leadTimeDays} days</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              <th style={{ padding: "8px 8px 8px 16px", width: 32 }} />
              {["Product", "Sales Velocity", "Stock On Hand", "Days Left", "Reorder Qty", "Reorder By"].map((label) => (
                <th key={label} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.lines.map((line) => {
              const isChecked = checked.has(line.variantId);
              const isDefaultVariant = !line.variantTitle || line.variantTitle === "Default Title";
              return (
                <tr key={line.variantId} style={{ borderBottom: "1px solid #f3f4f6", opacity: isChecked ? 1 : 0.55 }}>
                  <td style={{ padding: "10px 8px 10px 16px" }}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleChecked(line.variantId)}
                      aria-label={`Select ${line.productTitle ?? "product"}`}
                      style={{ cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {line.imageUrl ? (
                        <img
                          src={line.imageUrl}
                          alt={line.imageAlt ?? ""}
                          width={36}
                          height={36}
                          loading="lazy"
                          style={{ borderRadius: 6, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0 }} />
                      )}
                      <div>
                        <Link to={`/app/products/${line.productId}`} style={{ fontWeight: 500, color: "#111827", textDecoration: "none" }}>
                          {line.productTitle ?? "—"}
                        </Link>
                        {!isDefaultVariant && <div style={{ fontSize: 12, color: "#6b7280" }}>{line.variantTitle}</div>}
                        {line.sku && <div style={{ fontSize: 12, color: "#9ca3af" }}>{line.sku}</div>}
                        {/* Explains *why* this row's numbers are what they
                            are — far more useful to a merchant than any
                            precedence scheme they'd otherwise have to
                            reason about. Only present in custom mode. */}
                        {line.matchedRuleName && (
                          <div style={{ marginTop: 3, display: "inline-block", fontSize: 11, fontWeight: 600, color: "#c97d10", background: "#fdf1dd", borderRadius: 6, padding: "2px 7px" }}>
                            Rule: {line.matchedRuleName}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <SalesVelocityBadge unitsPerDay={line.avgDailySales} isManual={!!line.manualDailySales} />
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>{line.currentQuantity}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <StockOutBadge days={line.stockOutDays} isManual={!!line.manualDailySales} />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <input
                      type="number"
                      min={0}
                      disabled={!isChecked}
                      value={qtyByVariant[line.variantId] ?? 0}
                      onChange={(e) => onQtyChange(line.variantId, clampQuantity(Number(e.target.value)))}
                      style={{ width: 72, padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
                    />
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <ReorderBadge days={line.stockOutDays} leadTime={group.leadTimeDays} isOutOfStock={line.currentQuantity <= 0} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 13, color: "#374151" }}>
          {checkedLines.length} product{checkedLines.length === 1 ? "" : "s"} selected · {subtotalUnits.toLocaleString()} units to reorder
        </span>
        <button
          type="button"
          disabled={checkedLines.length === 0}
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: checkedLines.length === 0 ? "#9ca3af" : "#111827", color: "#fff",
            cursor: checkedLines.length === 0 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
          }}
        >
          Create Purchase Order
        </button>
      </div>

      {showCreateModal && (
        <CreatePurchaseOrderModal
          suppliers={suppliers}
          locations={locations}
          preselect={{ rows: candidateRows, defaultSupplierId: group.supplierId }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
