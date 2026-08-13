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
};
type CreateSupplierResult = { success: boolean; error?: string; id?: string; name?: string };

const NO_LOCATION = "__none__";
const NEW_SUPPLIER = "__new__";

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
  // Every freshly created line always has either a real locationId (a
  // multi-location variant) or an empty `locations` array (a single-location
  // variant/shop), matching exactly what a real refetch would also produce
  // for a brand-new PO, so `locations: []` here is never wrong, just
  // unpopulated the same way the server-driven data would be too.
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
    setQuantities((prev) => Object.fromEntries(Object.keys(prev).map((k) => [k, "0"])));
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
      {showSuccess && createFetcher.data?.success && (
        <div style={{ marginBottom: 10, background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "8px 12px", color: "#065f46", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>Purchase order created.</span>
          {createFetcher.data.purchaseOrderId && (
            <Link to={`/app/purchase-orders/${createFetcher.data.purchaseOrderId}`} style={{ color: "#065f46", fontWeight: 600, whiteSpace: "nowrap" }}>
              View it →
            </Link>
          )}
        </div>
      )}

      <label htmlFor="po-supplier-select" style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Supplier</label>
      <select
        id="po-supplier-select"
        value={showNewSupplierForm ? NEW_SUPPLIER : supplierId}
        onChange={(e) => handleSupplierChange(e.target.value)}
        style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, marginBottom: 10 }}
      >
        <option value="">Select a supplier…</option>
        {supplierList.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
        <option value={NEW_SUPPLIER}>+ New Supplier…</option>
      </select>

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

      {supplierId && (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {variants.map((v) => (
              <div key={v.variantId} style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: v.locations.length > 1 ? 8 : 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                    {productTitle}{v.variantTitle && v.variantTitle !== "Default Title" ? ` — ${v.variantTitle}` : ""}
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
                      aria-label={`Quantity to order for ${v.variantTitle && v.variantTitle !== "Default Title" ? `${productTitle} — ${v.variantTitle}` : productTitle}`}
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
