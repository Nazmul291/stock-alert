import { useEffect, useRef, useState } from "react";
import { useFetcher, Link } from "react-router";
import type { ProductDetailVariantForPo } from "../../lib/product-detail.server";
import { useLiveEventsStore } from "../../stores/live-events-store";
import { useProductDetailStore } from "../../stores/product-detail-store";
import { SkeletonBlock } from "../Skeleton";

type SupplierOption = { id: string; name: string };
type CreatedPoLine = {
  id: string;
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
  locationId: string | null;
  locationName: string | null;
};
type CreatePOResult = {
  success: boolean;
  error?: string;
  purchaseOrderId?: string;
  poNumber?: number;
  createdAt?: string;
  supplierName?: string;
  lineItems?: CreatedPoLine[];
  // Non-fatal — set when the PO itself was created fine but pushing the
  // unit cost to Shopify's own "Cost per item" field failed for one or
  // more lines (see syncLineCostsToShopify in purchase-order.server.ts).
  costSyncWarning?: string | null;
};
type CreateSupplierResult = { success: boolean; error?: string; id?: string; name?: string };

const NEW_SUPPLIER = "__new__";

// Shopify's Money scalar is already a decimal string (e.g. "19.99"), but
// doesn't guarantee 2 decimal places — normalizes display without pulling
// in a currency-formatting dependency for one column.
function formatMoney(raw: string): string {
  const n = parseFloat(raw);
  return isNaN(n) ? raw : n.toFixed(2);
}

export function ProductCreatePoCard({
  variants,
  suppliers,
  defaultSupplierId,
  productTitle,
}: {
  variants: ProductDetailVariantForPo[];
  suppliers: SupplierOption[];
  defaultSupplierId: string | null;
  productTitle: string;
}) {
  const [supplierList, setSupplierList] = useState(suppliers);
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? "");
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
  const supplierFetcher = useFetcher<CreateSupplierResult>();

  function handleSupplierChange(value: string) {
    if (value === NEW_SUPPLIER) {
      setShowNewSupplierForm(true);
      return;
    }
    setSupplierId(value);
    setShowNewSupplierForm(false);
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

  function createNewSupplier() {
    if (!newSupplierName.trim() || !newSupplierEmail.trim() || !newSupplierPhone.trim()) return;
    supplierFetcher.submit(
      {
        intent: "create_supplier",
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
      },
      { method: "post" },
    );
  }

  useEffect(() => {
    if (supplierFetcher.state !== "idle" || !supplierFetcher.data) return;
    if (supplierFetcher.data.success && supplierFetcher.data.id && supplierFetcher.data.name) {
      const created = { id: supplierFetcher.data.id, name: supplierFetcher.data.name };
      setSupplierList((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(created.id);
      setShowNewSupplierForm(false);
      resetNewSupplierForm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierFetcher.state, supplierFetcher.data]);

  // Every variant carries the same set of shop locations (only `available`
  // differs per variant) — see getVariantLocationsForPicker — so any
  // variant's list is the canonical one for this single, PO-wide choice.
  const shopLocations = variants[0]?.locations ?? [];
  const [locationId, setLocationId] = useState(shopLocations[0]?.locationId ?? "");

  // Unchecked by default — a merchant explicitly opts a variant into the
  // order instead of every variant being included just by having a nonzero
  // quantity sitting in an always-visible field.
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(variants.map((v) => [v.variantId, false])),
  );
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(variants.map((v) => [v.variantId, String(Math.max(v.suggestedQuantity, 0))])),
  );
  const [unitCosts, setUnitCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(variants.map((v) => [v.variantId, v.unitCost != null ? String(v.unitCost) : ""])),
  );
  // Editable override for a variant with no SKU tracked yet — sent to
  // createPurchaseOrder, which falls back to InventoryTracking.sku when this
  // is left blank (never the other way around, so it can't blank out a real
  // synced SKU). Seeded from the same live-Shopify value the Price/Unit cost
  // columns already use — see ProductDetailVariantForPo / getVariantPricing.
  const [skus, setSkus] = useState<Record<string, string>>(() =>
    Object.fromEntries(variants.map((v) => [v.variantId, v.sku ?? ""])),
  );

  function toggleSelected(variantId: string) {
    setSelected((prev) => ({ ...prev, [variantId]: !prev[variantId] }));
  }

  const createFetcher = useFetcher<CreatePOResult>();
  const creating = createFetcher.state !== "idle";
  const bumpLiveEvents = useLiveEventsStore((s) => s.bump);
  const addPurchaseOrder = useProductDetailStore((s) => s.addPurchaseOrder);
  const [showSuccess, setShowSuccess] = useState(false);
  // Read inside the success effect via .current rather than as a dependency
  // — the effect must only fire once per submission, not every time the
  // supplier dropdown changes (e.g. picking a different supplier right after
  // an earlier order succeeded would otherwise re-run this and add a
  // duplicate row for the already-created PO).
  const supplierIdRef = useRef(supplierId);
  supplierIdRef.current = supplierId;

  // Stays on this page instead of navigating to the new PO — redirecting to
  // the PO detail page is only what the general Purchase Orders page's own
  // create flow does, not this one. Patches the new PO straight into the
  // page's store so the pending list above shows it immediately, rather than
  // waiting on the bump below's background SSE refetch (still fired, so
  // other tabs on the same product — and this one, eventually — reconcile
  // with the server's copy) — see product-detail-store.ts's addPurchaseOrder.
  useEffect(() => {
    if (createFetcher.state !== "idle" || !createFetcher.data?.success) return;
    const po = createFetcher.data;
    if (po.purchaseOrderId && po.poNumber != null && po.createdAt && po.supplierName && po.lineItems) {
      addPurchaseOrder({
        id: po.purchaseOrderId,
        poNumber: po.poNumber,
        status: "draft",
        supplierId: supplierIdRef.current,
        supplierName: po.supplierName,
        quantityOrdered: po.lineItems.reduce((sum, li) => sum + li.quantityOrdered, 0),
        quantityReceived: 0,
        createdAt: po.createdAt,
        lineItems: po.lineItems.map((li) => ({ ...li, locations: [] })),
      });
    }
    setSelected((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, false])));
    bumpLiveEvents(["product-detail"]);
    setShowSuccess(true);
  }, [createFetcher.state, createFetcher.data, bumpLiveEvents, addPurchaseOrder]);

  // Auto-dismisses the "Purchase order created" banner after 5s instead of
  // leaving it up indefinitely — the new PO is already visible in the
  // pending list above by then, so the banner's job is done.
  useEffect(() => {
    if (!showSuccess) return;
    const timer = setTimeout(() => setShowSuccess(false), 5000);
    return () => clearTimeout(timer);
  }, [showSuccess]);

  const hasValidLine = variants.some((v) => selected[v.variantId] && (parseInt(quantities[v.variantId] ?? "0") || 0) > 0);
  const canSubmit = !!supplierId && !!locationId && hasValidLine && !creating;

  function handleCreate() {
    const chosenLocation = shopLocations.find((loc) => loc.locationId === locationId) ?? null;
    const submitLines: Array<{ variantId: string; quantityOrdered: number; unitCost: number | null; sku: string | null; locationId: string | null; locationName: string | null }> = [];
    for (const v of variants) {
      if (!selected[v.variantId]) continue;
      const quantityOrdered = parseInt(quantities[v.variantId] ?? "0") || 0;
      if (quantityOrdered <= 0) continue;
      const rawUnitCost = unitCosts[v.variantId] ?? "";
      const unitCost = rawUnitCost.trim() !== "" && !isNaN(parseFloat(rawUnitCost)) ? parseFloat(rawUnitCost) : null;
      submitLines.push({
        variantId: v.variantId,
        quantityOrdered,
        unitCost,
        sku: (skus[v.variantId] ?? "").trim() || null,
        locationId: chosenLocation?.locationId ?? null,
        locationName: chosenLocation?.locationName ?? null,
      });
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
      {showSuccess && createFetcher.data?.success && (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "8px 12px", color: "#065f46", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span>Purchase order created.</span>
            {createFetcher.data.purchaseOrderId && (
              <Link to={`/app/purchase-orders/${createFetcher.data.purchaseOrderId}`} style={{ color: "#065f46", fontWeight: 600, whiteSpace: "nowrap" }}>
                View it →
              </Link>
            )}
          </div>
          {createFetcher.data.costSyncWarning && (
            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 12px", color: "#92400e", fontSize: 13 }}>
              {createFetcher.data.costSyncWarning}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
        <div>
          <label htmlFor="po-supplier-select" style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Supplier</label>
          <select
            id="po-supplier-select"
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
          <label htmlFor="po-location-select" style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Location</label>
          <select
            id="po-location-select"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            disabled={shopLocations.length === 0}
            style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
          >
            <option value="">Select a location…</option>
            {shopLocations.map((loc) => (
              <option key={loc.locationId} value={loc.locationId}>{loc.locationName}</option>
            ))}
          </select>
        </div>
      </div>

      {showNewSupplierForm && (
        <div style={{ marginBottom: 14, padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          {supplierFetcher.data && !supplierFetcher.data.success && (
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#991b1b" }}>{supplierFetcher.data.error}</p>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              type="text" placeholder="Company *" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)}
              style={{ flex: "1 1 140px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="text" placeholder="Contact name" value={newSupplierContactName} onChange={(e) => setNewSupplierContactName(e.target.value)}
              style={{ flex: "1 1 140px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              type="email" required placeholder="Email *" value={newSupplierEmail} onChange={(e) => setNewSupplierEmail(e.target.value)}
              style={{ flex: "1 1 140px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="tel" required placeholder="Phone *" value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)}
              style={{ flex: "1 1 140px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="url" placeholder="Website" value={newSupplierWebsite} onChange={(e) => setNewSupplierWebsite(e.target.value)}
              style={{ flex: "1 1 140px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              type="text" placeholder="Address" value={newSupplierAddress1} onChange={(e) => setNewSupplierAddress1(e.target.value)}
              style={{ flex: "1 1 200px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="text" placeholder="Apartment, suite, etc" value={newSupplierAddress2} onChange={(e) => setNewSupplierAddress2(e.target.value)}
              style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              type="text" placeholder="City" value={newSupplierCity} onChange={(e) => setNewSupplierCity(e.target.value)}
              style={{ flex: "1 1 120px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="text" placeholder="State/Province" value={newSupplierProvince} onChange={(e) => setNewSupplierProvince(e.target.value)}
              style={{ flex: "1 1 120px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="text" placeholder="ZIP code" value={newSupplierZip} onChange={(e) => setNewSupplierZip(e.target.value)}
              style={{ flex: "1 1 100px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="text" placeholder="Country/region" value={newSupplierCountry} onChange={(e) => setNewSupplierCountry(e.target.value)}
              style={{ flex: "1 1 140px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <input
              type="text" placeholder="Payment terms (e.g. Net 30)" value={newSupplierPaymentTerms} onChange={(e) => setNewSupplierPaymentTerms(e.target.value)}
              style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="text" maxLength={10} placeholder="Currency (e.g. USD)" value={newSupplierCurrency} onChange={(e) => setNewSupplierCurrency(e.target.value)}
              style={{ flex: "1 1 130px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
            <input
              type="number" min={1} placeholder="Lead time (days)" value={newSupplierLeadTime} onChange={(e) => setNewSupplierLeadTime(e.target.value)}
              style={{ flex: "1 1 110px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
            />
          </div>
          <button
            type="button" onClick={createNewSupplier} disabled={!newSupplierName.trim() || !newSupplierEmail.trim() || !newSupplierPhone.trim() || supplierFetcher.state !== "idle"}
            style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !newSupplierName.trim() || !newSupplierEmail.trim() || !newSupplierPhone.trim() ? "not-allowed" : "pointer" }}
          >
            {supplierFetcher.state !== "idle" ? "Creating…" : "Create Supplier"}
          </button>
        </div>
      )}

      {supplierId && locationId && (
        <>
          <div style={{ border: "1px solid #f3f4f6", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f9fafb", borderBottom: "1px solid #f3f4f6", fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
              <span style={{ width: 16 }} />
              <span style={{ flex: 1 }}>Variant</span>
              <span style={{ width: 80 }}>SKU</span>
              <span style={{ width: 65, textAlign: "right" }}>Price</span>
              <span style={{ width: 90, textAlign: "right" }}>Unit cost</span>
              <span style={{ width: 70, textAlign: "right" }}>Quantity</span>
            </div>
            {variants.map((v) => {
              const isSelected = !!selected[v.variantId];
              return (
                <div
                  key={v.variantId}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #f3f4f6" }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(v.variantId)}
                    aria-label={`Include ${v.variantTitle && v.variantTitle !== "Default Title" ? `${productTitle} — ${v.variantTitle}` : productTitle} in this order`}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      {productTitle}{v.variantTitle && v.variantTitle !== "Default Title" ? ` — ${v.variantTitle}` : ""}
                    </span>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {v.currentQuantity} in stock
                    </div>
                  </div>
                  <input
                    type="text" placeholder="Add SKU"
                    value={skus[v.variantId] ?? ""}
                    onChange={(e) => setSkus((prev) => ({ ...prev, [v.variantId]: e.target.value }))}
                    aria-label={`SKU for ${v.variantTitle && v.variantTitle !== "Default Title" ? `${productTitle} — ${v.variantTitle}` : productTitle}`}
                    style={{ width: 80, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 12, flexShrink: 0 }}
                  />
                  <div style={{ width: 65, textAlign: "right", flexShrink: 0 }}>
                    {v.price != null && <div style={{ fontSize: 13, color: "#374151" }}>{formatMoney(v.price)}</div>}
                    {v.compareAtPrice != null && (
                      <div style={{ fontSize: 11, color: "#9ca3af", textDecoration: "line-through" }}>{formatMoney(v.compareAtPrice)}</div>
                    )}
                  </div>
                  {isSelected ? (
                    <>
                      <input
                        type="number" min={0} step={0.01}
                        value={unitCosts[v.variantId] ?? ""}
                        onChange={(e) => setUnitCosts((prev) => ({ ...prev, [v.variantId]: e.target.value }))}
                        aria-label={`Unit cost for ${v.variantTitle && v.variantTitle !== "Default Title" ? `${productTitle} — ${v.variantTitle}` : productTitle}`}
                        style={{ width: 90, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13, textAlign: "right" }}
                      />
                      <input
                        type="number" min={0}
                        value={quantities[v.variantId] ?? "0"}
                        onChange={(e) => setQuantities((prev) => ({ ...prev, [v.variantId]: e.target.value }))}
                        aria-label={`Quantity to order for ${v.variantTitle && v.variantTitle !== "Default Title" ? `${productTitle} — ${v.variantTitle}` : productTitle}`}
                        style={{ width: 70, boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13, textAlign: "right" }}
                      />
                    </>
                  ) : (
                    <>
                      {/* Unlike Quantity, a unit cost can be meaningful even
                          while unchecked (prefilled from Shopify's own "Cost
                          per item" — see product-detail.server.ts) — show it
                          instead of hiding real data behind a blanket dash. */}
                      <span style={{ width: 90, textAlign: "right", fontSize: 13, color: unitCosts[v.variantId] ? "#9ca3af" : "#d1d5db" }}>
                        {unitCosts[v.variantId] && !isNaN(parseFloat(unitCosts[v.variantId])) ? formatMoney(unitCosts[v.variantId]) : "—"}
                      </span>
                      <span style={{ width: 70, textAlign: "right", fontSize: 13, color: "#d1d5db" }}>—</span>
                    </>
                  )}
                </div>
              );
            })}
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

// Shown instead of the real card while product-detail data is still
// loading — same reasoning as ProductConfigureCardSkeleton: this form's
// per-variant quantity/cost inputs are seeded from `variants`/`suppliers`
// only once, on mount, so it can't be mounted early with placeholder props.
export function ProductCreatePoCardSkeleton() {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
      <SkeletonBlock width={180} height={16} />
      <SkeletonBlock width="100%" height={34} borderRadius={6} />
      <SkeletonBlock width="100%" height={80} borderRadius={8} />
      <SkeletonBlock width={140} height={34} borderRadius={6} />
    </div>
  );
}
