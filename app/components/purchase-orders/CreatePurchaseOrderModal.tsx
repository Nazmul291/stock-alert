import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";
import { ProductPickerModal } from "./ProductPickerModal";
import { Thumbnail } from "./Thumbnail";
import { usePurchaseOrderActionsStore } from "../../stores/purchase-order-actions-store";
import type { CreatedPurchaseOrder } from "../../lib/purchase-order.server";
import { PAYMENT_TERMS_OPTIONS, CURRENCY_OPTIONS, paymentTermsLabel } from "../../lib/supplier-options";

const NEW_SUPPLIER = "__new__";

export type LineState = {
  productTitle: string | null;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  currentQuantity: number;
  price: string | null;
  compareAtPrice: string | null;
  quantityOrdered: string;
  unitCost: string;
};
export type CandidateRow = {
  productId: string;
  variantId: string;
  productTitle: string | null;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  currentQuantity: number;
  suggestedQuantity: number;
  unitCost: number | null;
  price: string | null;
  compareAtPrice: string | null;
};

type SupplierOption = { id: string; name: string; paymentTerms: string | null };
type LocationOption = { id: string; name: string };

function formatMoney(n: number): string {
  return n.toFixed(2);
}

function rowToLine(row: CandidateRow): LineState {
  return {
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    sku: row.sku,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    currentQuantity: row.currentQuantity,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    // Left empty rather than forced to 1 when there's no suggested quantity
    // to seed it with, so an empty field visibly still needs the
    // merchant's input instead of silently ordering 1 of something they
    // only meant to review.
    quantityOrdered: row.suggestedQuantity > 0 ? String(row.suggestedQuantity) : "",
    unitCost: row.unitCost != null ? String(row.unitCost) : "",
  };
}

export function CreatePurchaseOrderModal({
  suppliers,
  locations,
  preselect,
  onCreated,
  onClose,
}: {
  suppliers: SupplierOption[];
  locations: LocationOption[];
  // Opens the modal with rows already selected, and (when set) a supplier
  // preselected. `productId` is optional: when present (the product-detail
  // page's use case, replacing the old ProductCreatePoCard) it travels with
  // the submit and triggers the server's "supplier of record" write for that
  // product (see api.purchase-orders.create.ts). Omit it for preselects that
  // span many products with an already-correct supplier (e.g. Reorder
  // Planner) — there's no single product to reassign, and every row's
  // supplier is already right.
  preselect?: { productId?: string; rows: CandidateRow[]; defaultSupplierId?: string | null };
  // When provided, the modal stays open on success and shows an inline
  // confirmation instead of navigating to the new PO — the product-detail
  // page uses this to patch its own store and keep the merchant in place.
  onCreated?: (result: { purchaseOrder: CreatedPurchaseOrder; supplierId: string; supplierOfRecordWarning: string | null }) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const {
    createSupplier: submitCreateSupplier,
    createPurchaseOrder: submitCreatePurchaseOrder,
    creatingSupplier,
    supplierError,
    creatingPurchaseOrder,
    purchaseOrderError,
    reset: resetActionsStore,
  } = usePurchaseOrderActionsStore();
  // The store is a module singleton shared by every page — without this, a
  // previous modal session's leftover error would show the instant this
  // one opens.
  useEffect(() => { resetActionsStore(); }, [resetActionsStore]);

  // Suppliers created inline this session, merged on top of the `suppliers`
  // prop rather than a useState(suppliers) snapshot — a prop that arrives
  // (or changes) after mount can no longer get locked out. That snapshot is
  // exactly what left the dropdown permanently empty the first time this
  // modal was mounted behind a still-in-flight lazy fetch (Products page).
  const [extraSuppliers, setExtraSuppliers] = useState<SupplierOption[]>([]);
  const supplierList = useMemo(
    () => [...suppliers, ...extraSuppliers].sort((a, b) => a.name.localeCompare(b.name)),
    [suppliers, extraSuppliers],
  );

  // null means "merchant hasn't chosen" — the fallback re-evaluates on
  // every render, so a late-arriving prop still yields a sane default
  // instead of being locked out the way a useState(prop) snapshot would be.
  const [supplierIdOverride, setSupplierIdOverride] = useState<string | null>(null);
  const supplierId = supplierIdOverride ?? preselect?.defaultSupplierId ?? "";
  const [locationIdOverride, setLocationIdOverride] = useState<string | null>(null);
  const locationId = locationIdOverride ?? locations[0]?.id ?? "";

  const [showNewSupplierForm, setShowNewSupplierForm] = useState(suppliers.length === 0);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierContactName, setNewSupplierContactName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [newSupplierWebsite, setNewSupplierWebsite] = useState("");
  const [newSupplierAddress1, setNewSupplierAddress1] = useState("");
  const [newSupplierAddress2, setNewSupplierAddress2] = useState("");
  const [newSupplierCity, setNewSupplierCity] = useState("");
  const [newSupplierProvince, setNewSupplierProvince] = useState("");
  const [newSupplierZip, setNewSupplierZip] = useState("");
  const [newSupplierCountry, setNewSupplierCountry] = useState("");
  const [newSupplierPaymentTerms, setNewSupplierPaymentTerms] = useState("");
  const [newSupplierCurrency, setNewSupplierCurrency] = useState("");
  const [newSupplierLeadTime, setNewSupplierLeadTime] = useState("");
  // Genuinely mount-once, unlike the fields above — this is merchant-edited
  // state, not a mirror of a prop that can change out from under it. Safe
  // as long as the modal itself is only ever mounted once its data (and
  // preselect, if any) is actually ready, which both call sites already do.
  const [lines, setLines] = useState<Record<string, LineState>>(() =>
    preselect ? Object.fromEntries(preselect.rows.map((r) => [r.variantId, rowToLine(r)])) : {},
  );
  const [referenceNumber, setReferenceNumber] = useState("");
  const [supplierNote, setSupplierNote] = useState("");
  const [terms, setTerms] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const [createdPo, setCreatedPo] = useState<CreatedPurchaseOrder | null>(null);
  const [createWarnings, setCreateWarnings] = useState<string[]>([]);

  function handleSupplierChange(value: string) {
    if (value === NEW_SUPPLIER) {
      setShowNewSupplierForm(true);
      return;
    }
    setSupplierIdOverride(value);
    setShowNewSupplierForm(false);
    // Auto-populates from the supplier's own payment terms, same as
    // Shopify's own supplier form promises ("This will auto populate the
    // payment information on the purchase order.") — only when the
    // merchant hasn't already typed something of their own in here.
    if (value && !terms.trim()) {
      const picked = supplierList.find((s) => s.id === value);
      if (picked?.paymentTerms) setTerms(paymentTermsLabel(picked.paymentTerms) ?? picked.paymentTerms);
    }
  }

  function resetNewSupplierForm() {
    setNewSupplierName("");
    setNewSupplierContactName("");
    setNewSupplierEmail("");
    setNewSupplierPhone("");
    setNewSupplierWebsite("");
    setNewSupplierAddress1("");
    setNewSupplierAddress2("");
    setNewSupplierCity("");
    setNewSupplierProvince("");
    setNewSupplierZip("");
    setNewSupplierCountry("");
    setNewSupplierPaymentTerms("");
    setNewSupplierCurrency("");
    setNewSupplierLeadTime("");
  }

  async function createNewSupplier() {
    if (!newSupplierName.trim() || !newSupplierEmail.trim() || !newSupplierPhone.trim()) return;
    const result = await submitCreateSupplier({
      name: newSupplierName,
      contactName: newSupplierContactName,
      email: newSupplierEmail,
      phone: newSupplierPhone,
      website: newSupplierWebsite,
      address1: newSupplierAddress1,
      address2: newSupplierAddress2,
      city: newSupplierCity,
      province: newSupplierProvince,
      zip: newSupplierZip,
      country: newSupplierCountry,
      paymentTerms: newSupplierPaymentTerms,
      currency: newSupplierCurrency,
      leadTimeDays: newSupplierLeadTime,
    });
    if (!result.success) return; // supplierError already set in the store
    const paymentTerms = newSupplierPaymentTerms.trim() || null;
    setExtraSuppliers((prev) => [...prev, { ...result.supplier, paymentTerms }]);
    setSupplierIdOverride(result.supplier.id);
    setShowNewSupplierForm(false);
    if (!terms.trim() && paymentTerms) setTerms(paymentTermsLabel(paymentTerms) ?? paymentTerms);
    resetNewSupplierForm();
  }

  function toggleLine(row: CandidateRow) {
    setLines((prev) => {
      if (prev[row.variantId]) {
        const next = { ...prev };
        delete next[row.variantId];
        return next;
      }
      return { ...prev, [row.variantId]: rowToLine(row) };
    });
  }

  function updateLine(variantId: string, patch: Partial<LineState>) {
    setLines((prev) => (prev[variantId] ? { ...prev, [variantId]: { ...prev[variantId], ...patch } } : prev));
  }

  function removeLine(variantId: string) {
    setLines((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }

  const lineEntries = Object.entries(lines);
  const hasValidLine = lineEntries.some(([, l]) => (parseInt(l.quantityOrdered) || 0) > 0);
  const canSubmit = !!supplierId && !!locationId && hasValidLine && !creatingPurchaseOrder;

  async function handleCreate() {
    const chosenLocation = locations.find((l) => l.id === locationId) ?? null;
    const submitLines = lineEntries
      .map(([variantId, l]) => ({
        variantId,
        quantityOrdered: parseInt(l.quantityOrdered) || 0,
        unitCost: l.unitCost.trim() !== "" && !isNaN(parseFloat(l.unitCost)) ? parseFloat(l.unitCost) : null,
        sku: l.sku,
      }))
      .filter((l) => l.quantityOrdered > 0);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const result = await submitCreatePurchaseOrder({
      supplierId,
      locationId: chosenLocation?.id ?? "",
      locationName: chosenLocation?.name ?? "",
      lines: submitLines,
      referenceNumber,
      supplierNote,
      terms,
      tags,
      ...(preselect?.productId ? { productId: preselect.productId } : {}),
    });
    if (!result.success) return; // purchaseOrderError already set in the store

    if (!onCreated) {
      // Default, unchanged: Purchase Orders page and Products list both
      // jump straight to the new PO.
      navigate(`/app/purchase-orders/${result.purchaseOrder.purchaseOrderId}`);
      return;
    }
    onCreated({ purchaseOrder: result.purchaseOrder, supplierId, supplierOfRecordWarning: result.supplierOfRecordWarning });
    setCreatedPo(result.purchaseOrder);
    setCreateWarnings([result.purchaseOrder.costSyncWarning, result.supplierOfRecordWarning].filter((w): w is string => !!w));
  }

  // Portal to <body>, not rendered inline inside <s-page> — matches
  // ManagePurchaseOrderModal's existing pattern. Font is set explicitly
  // because the portal escapes <s-page>'s DOM subtree, where the admin's
  // Inter font is actually applied.
  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
      onClick={(e) => { if (e.target === e.currentTarget && !createdPo) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 820, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>{createdPo ? "Purchase order created" : "Create Purchase Order"}</p>
          {!createdPo && (
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
              ✕
            </button>
          )}
        </div>

        {createdPo ? (
          <div style={{ padding: "16px 24px 24px" }}>
            <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "8px 12px", marginBottom: 10, color: "#065f46", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span>Purchase order #{createdPo.poNumber} created.</span>
              <Link to={`/app/purchase-orders/${createdPo.purchaseOrderId}`} style={{ color: "#065f46", fontWeight: 600, whiteSpace: "nowrap" }}>
                View it →
              </Link>
            </div>
            {createWarnings.map((w) => (
              <div key={w} style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 12px", marginBottom: 10, color: "#92400e", fontSize: 13 }}>
                {w}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px 24px" }}>
          {purchaseOrderError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
              {purchaseOrderError}
            </div>
          )}

          {/* Supplier + Location side by side, always visible — same layout
              as the product-detail page's Create Purchase Order card. */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Supplier</label>
              <select
                value={showNewSupplierForm ? NEW_SUPPLIER : supplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              >
                <option value="">Select a supplier…</option>
                {supplierList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                <option value={NEW_SUPPLIER}>+ New Supplier…</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Location</label>
              <select
                value={locationId}
                onChange={(e) => setLocationIdOverride(e.target.value)}
                disabled={locations.length === 0}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              >
                <option value="">Select a location…</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>
          </div>

          {showNewSupplierForm && (
            <div style={{ marginBottom: 20, padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              {supplierError && (
                <p style={{ margin: "0 0 8px", fontSize: 12, color: "#991b1b" }}>{supplierError}</p>
              )}
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  type="text" placeholder="Company *" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)}
                  style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
                <input
                  type="text" placeholder="Contact name" value={newSupplierContactName} onChange={(e) => setNewSupplierContactName(e.target.value)}
                  style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  type="email" required placeholder="Email *" value={newSupplierEmail} onChange={(e) => setNewSupplierEmail(e.target.value)}
                  style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
                <input
                  type="tel" required placeholder="Phone *" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)}
                  style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
                <input
                  type="url" placeholder="Website" value={newSupplierWebsite} onChange={(e) => setNewSupplierWebsite(e.target.value)}
                  style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  type="text" placeholder="Address" value={newSupplierAddress1} onChange={(e) => setNewSupplierAddress1(e.target.value)}
                  style={{ flex: "1 1 220px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
                <input
                  type="text" placeholder="Apartment, suite, etc" value={newSupplierAddress2} onChange={(e) => setNewSupplierAddress2(e.target.value)}
                  style={{ flex: "1 1 180px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  type="text" placeholder="City" value={newSupplierCity} onChange={(e) => setNewSupplierCity(e.target.value)}
                  style={{ flex: "1 1 130px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
                <input
                  type="text" placeholder="State/Province" value={newSupplierProvince} onChange={(e) => setNewSupplierProvince(e.target.value)}
                  style={{ flex: "1 1 130px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
                <input
                  type="text" placeholder="ZIP code" value={newSupplierZip} onChange={(e) => setNewSupplierZip(e.target.value)}
                  style={{ flex: "1 1 110px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
                <input
                  type="text" placeholder="Country/region" value={newSupplierCountry} onChange={(e) => setNewSupplierCountry(e.target.value)}
                  style={{ flex: "1 1 150px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <select
                  value={newSupplierPaymentTerms} onChange={(e) => setNewSupplierPaymentTerms(e.target.value)}
                  style={{ flex: "1 1 180px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                >
                  {PAYMENT_TERMS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.value ? o.label : "Payment terms"}</option>
                  ))}
                </select>
                <select
                  value={newSupplierCurrency} onChange={(e) => setNewSupplierCurrency(e.target.value)}
                  style={{ flex: "1 1 140px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                >
                  <option value="">Currency</option>
                  {CURRENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <input
                  type="number" min={1} placeholder="Lead time (days)" value={newSupplierLeadTime} onChange={(e) => setNewSupplierLeadTime(e.target.value)}
                  style={{ flex: "1 1 120px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                />
              </div>
              <button
                type="button" onClick={createNewSupplier} disabled={!newSupplierName.trim() || !newSupplierEmail.trim() || !newSupplierPhone.trim() || creatingSupplier}
                style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !newSupplierName.trim() || !newSupplierEmail.trim() || !newSupplierPhone.trim() ? "not-allowed" : "pointer" }}
              >
                {creatingSupplier ? "Creating…" : "Create Supplier"}
              </button>
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Products</label>
            <div
              role="button" tabIndex={0}
              onClick={() => setPickerOpen(true)}
              onKeyDown={(e) => e.key === "Enter" && setPickerOpen(true)}
              style={{
                width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", color: "#9ca3af",
              }}
            >
              <span>Search or select products…</span>
              <span style={{ color: "#9ca3af" }}>🔍</span>
            </div>
          </div>

          {/* Same variant-table layout as the product-detail page's own
              Create Purchase Order card used to have — header row, row
              structure, and input styling all mirror it, swapping its
              checkbox for a thumbnail and adding a remove button and an
              editable SKU field (selection itself happens in
              ProductPickerModal, not here). Bounded height so a long
              selection still can't push the PO detail fields below out of
              view. */}
          {lineEntries.length > 0 && (
            <div style={{ border: "1px solid #f3f4f6", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
                <span style={{ width: 24 }} />
                <span style={{ flex: 1 }}>Product</span>
                <span style={{ width: 80 }}>SKU</span>
                <span style={{ width: 65, textAlign: "right" }}>Price</span>
                <span style={{ width: 90, textAlign: "right" }}>Unit cost</span>
                <span style={{ width: 70, textAlign: "right" }}>Quantity</span>
                <span style={{ width: 16 }} />
              </div>
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {lineEntries.map(([variantId, l]) => (
                  <div key={variantId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #f3f4f6" }}>
                    <Thumbnail imageUrl={l.imageUrl} imageAlt={l.imageAlt} size={24} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                        {l.productTitle ?? "—"}{l.variantTitle && l.variantTitle !== "Default Title" ? ` — ${l.variantTitle}` : ""}
                      </span>
                      <div style={{ fontSize: 11, color: "#9ca3af" }}>
                        {l.currentQuantity} in stock
                      </div>
                    </div>
                    <input
                      type="text" placeholder="Add SKU"
                      value={l.sku ?? ""}
                      onChange={(e) => updateLine(variantId, { sku: e.target.value || null })}
                      aria-label={`SKU for ${l.productTitle ?? "product"}`}
                      style={{ width: 80, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 12 }}
                    />
                    <div style={{ width: 65, textAlign: "right", flexShrink: 0 }}>
                      {l.price != null && !isNaN(parseFloat(l.price)) && (
                        <div style={{ fontSize: 13, color: "#374151" }}>{formatMoney(parseFloat(l.price))}</div>
                      )}
                      {l.compareAtPrice != null && !isNaN(parseFloat(l.compareAtPrice)) && (
                        <div style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through" }}>{formatMoney(parseFloat(l.compareAtPrice))}</div>
                      )}
                    </div>
                    <input
                      type="number" min={0} step={0.01}
                      value={l.unitCost}
                      onChange={(e) => updateLine(variantId, { unitCost: e.target.value })}
                      aria-label={`Unit cost for ${l.productTitle ?? "product"}`}
                      style={{ width: 90, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13, textAlign: "right" }}
                    />
                    <input
                      type="number" min={0}
                      value={l.quantityOrdered}
                      onChange={(e) => updateLine(variantId, { quantityOrdered: e.target.value })}
                      aria-label={`Quantity to order for ${l.productTitle ?? "product"}`}
                      style={{ width: 70, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13, textAlign: "right" }}
                    />
                    <button
                      type="button" onClick={() => removeLine(variantId)}
                      aria-label={`Remove ${l.productTitle ?? "product"} from this order`}
                      style={{ width: 16, background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pickerOpen && (
            <ProductPickerModal
              supplierId={supplierId}
              lines={lines}
              onToggleLine={toggleLine}
              onClose={() => setPickerOpen(false)}
            />
          )}

          <p style={{ fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 6, marginTop: 20 }}>
            {lineEntries.length} product{lineEntries.length !== 1 ? "s" : ""} selected
            {lineEntries.length > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 400, color: "#9ca3af" }}>
                Total: {formatMoney(lineEntries.reduce((sum, [, l]) => sum + (parseInt(l.quantityOrdered) || 0) * (parseFloat(l.unitCost) || 0), 0))}
              </span>
            )}
          </p>

          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 6 }}>Purchase order details</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Reference number</label>
                <input
                  type="text" maxLength={255} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Note to supplier</label>
                <textarea
                  rows={2} maxLength={5000} value={supplierNote} onChange={(e) => setSupplierNote(e.target.value)}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical" }}
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Terms</label>
                  <input
                    type="text" placeholder="e.g. Cash on delivery" value={terms} onChange={(e) => setTerms(e.target.value)}
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Tags</label>
                  <input
                    type="text" placeholder="Comma separated" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                    style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
                  />
                </div>
              </div>
            </div>
          </div>
          </div>
        )}

        <div style={{ padding: "14px 24px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          {createdPo ? (
            <button type="button" onClick={onClose}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={creatingPurchaseOrder}
                style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                Cancel
              </button>
              <button type="button" onClick={handleCreate} disabled={!canSubmit}
                style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: canSubmit ? "#111827" : "#9ca3af", color: "#fff", cursor: canSubmit ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 600 }}>
                {creatingPurchaseOrder ? "Creating…" : "Create Purchase Order"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
