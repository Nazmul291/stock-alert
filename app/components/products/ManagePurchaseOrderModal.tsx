import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher } from "react-router";
import { STATUS_STYLE } from "../purchase-orders/PurchaseOrderList";
import type { ProductPurchaseOrderRow } from "../../lib/product-detail.server";
import { useProductDetailStore } from "../../stores/product-detail-store";
import { StatusPill } from "../StatusPill";
import { buildReceiptDrafts, isReceiveLocationMissing } from "../../lib/purchase-order-receive";

type ActionResult = { success: boolean; error?: string; intent?: string };

// One modal for every PO-lifecycle action, opened from a single "Edit"
// button per row instead of a cluttered row of separate buttons.
//
// A draft can still be edited here (quantity/unit cost/supplier) via "Save
// Changes", which keeps it in draft. "Order Now" saves whatever is currently
// in the form AND places the order in one step — it used to take two
// separate clicks ("Send to Supplier" then "Mark as Ordered"); this
// consolidates both into the single action a merchant actually wants
// ("just order it"), sending the supplier email automatically instead of
// requiring a second manual step.
//
// Stays open across Save Changes/Order Now/Send to Supplier — patches the
// store directly (see the effects below) so `po` flows back in via props and
// the modal re-renders for the next step — and only closes after a
// successful receive or an explicit Close, since receiving is the natural
// end of the one-by-one flow.
export function ManagePurchaseOrderModal({
  po,
  suppliers,
  productTitle,
  onClose,
  onChanged,
}: {
  po: ProductPurchaseOrderRow;
  suppliers: { id: string; name: string }[];
  productTitle: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const editFetcher = useFetcher<ActionResult>();
  const actionFetcher = useFetcher<ActionResult>();
  const updatePurchaseOrder = useProductDetailStore((s) => s.updatePurchaseOrder);
  const busy = editFetcher.state !== "idle" || actionFetcher.state !== "idle";
  const lastActionIntent = actionFetcher.data?.intent;

  const isDraft = po.status === "draft";
  const canResend = po.status === "ordered";
  const canReceive = po.status === "ordered" || po.status === "partially_received";

  const [lineEdits, setLineEdits] = useState<Record<string, { quantityOrdered: string; unitCost: string }>>(() =>
    Object.fromEntries(po.lineItems.map((li) => [li.id, { quantityOrdered: String(li.quantityOrdered), unitCost: li.unitCost != null ? String(li.unitCost) : "" }])),
  );
  const [supplierId, setSupplierId] = useState(po.supplierId);

  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(po.lineItems.map((li) => [li.id, String(Math.max(0, li.quantityOrdered - li.quantityReceived))])),
  );
  const [locationEdits, setLocationEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(po.lineItems.map((li) => [li.id, li.locations.length === 1 ? li.locations[0].id : ""])),
  );

  // Builds the same lineItems/supplier patch Save Changes and Order Now both
  // submit to the server, and applies it straight to the store so the row
  // beneath (and this still-open modal, via its `po` prop) reflect it
  // immediately instead of waiting on onChanged()'s background refetch.
  function draftPatch() {
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? po.supplierName;
    const lineItems = po.lineItems.map((li) => ({
      ...li,
      quantityOrdered: Math.max(0, parseInt(lineEdits[li.id]?.quantityOrdered ?? "0") || 0),
      unitCost: lineEdits[li.id]?.unitCost.trim() ? parseFloat(lineEdits[li.id].unitCost) : null,
    }));
    return {
      supplierId,
      supplierName,
      lineItems,
      quantityOrdered: lineItems.reduce((sum, li) => sum + li.quantityOrdered, 0),
    };
  }

  useEffect(() => {
    if (editFetcher.state !== "idle" || !editFetcher.data?.success) return;
    updatePurchaseOrder(po.id, draftPatch());
    onChanged();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editFetcher.state, editFetcher.data]);

  useEffect(() => {
    if (actionFetcher.state !== "idle" || !actionFetcher.data?.success) return;
    if (actionFetcher.data.intent === "order_now") {
      updatePurchaseOrder(po.id, { ...draftPatch(), status: "ordered" });
    }
    onChanged();
    if (actionFetcher.data.intent === "receive_items") onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFetcher.state, actionFetcher.data]);

  const hasValidLine = Object.values(lineEdits).some((e) => (parseInt(e.quantityOrdered) || 0) > 0);

  function saveChanges() {
    const patch = draftPatch();
    editFetcher.submit(
      { intent: "update_line_items", lineItems: JSON.stringify(patch.lineItems.map((li) => ({ id: li.id, quantityOrdered: li.quantityOrdered, unitCost: li.unitCost }))), supplierId },
      { method: "post", action: `/app/purchase-orders/${po.id}` },
    );
  }

  function orderNow() {
    const patch = draftPatch();
    actionFetcher.submit(
      { intent: "order_now", lineItems: JSON.stringify(patch.lineItems.map((li) => ({ id: li.id, quantityOrdered: li.quantityOrdered, unitCost: li.unitCost }))), supplierId },
      { method: "post", action: `/app/purchase-orders/${po.id}` },
    );
  }

  function act(intent: string) {
    actionFetcher.submit({ intent }, { method: "post", action: `/app/purchase-orders/${po.id}` });
  }

  const locationMissing = isReceiveLocationMissing(po.lineItems, quantities, locationEdits);

  function handleReceive() {
    const receipts = buildReceiptDrafts(po.lineItems, quantities, locationEdits);
    if (receipts.length === 0) return;
    actionFetcher.submit(
      { intent: "receive_items", receipts: JSON.stringify(receipts) },
      { method: "post", action: `/app/purchase-orders/${po.id}` },
    );
  }

  const s = STATUS_STYLE[po.status];

  // Portal to <body> — this modal is triggered from inside a <table> row
  // (ProductPurchaseOrdersList), and a fixed-position overlay div isn't
  // valid as a direct child of a <tr>. Font is set explicitly here because
  // the portal escapes <s-page>'s DOM subtree, where the admin's Inter font
  // is actually applied — without this it silently falls back to the
  // browser default serif/sans-serif instead of matching the rest of the app.
  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>PO #{po.poNumber}</p>
            <StatusPill label={s.label} bg={s.bg} color={s.color} />
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px" }}>
          {((editFetcher.data && !editFetcher.data.success) || (actionFetcher.data && !actionFetcher.data.success)) && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
              {editFetcher.data?.error || actionFetcher.data?.error}
            </div>
          )}

          {isDraft && (
            <>
              <label htmlFor="manage-po-supplier" style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Supplier</label>
              <select
                id="manage-po-supplier"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, marginBottom: 14 }}
              >
                {suppliers.map((sOpt) => (
                  <option key={sOpt.id} value={sOpt.id}>{sOpt.name}</option>
                ))}
              </select>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                {po.lineItems.map((li) => (
                  <div key={li.id} style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: "10px 12px" }}>
                    <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#111827" }}>
                      {productTitle}{li.variantTitle && li.variantTitle !== "Default Title" ? ` — ${li.variantTitle}` : ""}
                      {li.sku && <span style={{ fontWeight: 400, color: "#9ca3af" }}> · {li.sku}</span>}
                      {li.locationName && <span style={{ fontWeight: 400, color: "#9ca3af" }}> — {li.locationName}</span>}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <label style={{ fontSize: 12, color: "#6b7280" }}>
                        Quantity
                        <input
                          type="number" min={0}
                          value={lineEdits[li.id]?.quantityOrdered ?? "0"}
                          onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], quantityOrdered: e.target.value } }))}
                          style={{ display: "block", width: 80, marginTop: 4, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: "#6b7280" }}>
                        Unit cost
                        <input
                          type="number" min={0} step={0.01}
                          value={lineEdits[li.id]?.unitCost ?? ""}
                          onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], unitCost: e.target.value } }))}
                          style={{ display: "block", width: 90, marginTop: 4, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {canReceive && (
            <>
              <p style={{ margin: "0 0 10px", fontWeight: 600, fontSize: 13, color: "#374151" }}>Receive items</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {po.lineItems.map((li) => {
                  const remaining = Math.max(0, li.quantityOrdered - li.quantityReceived);
                  return (
                    <div key={li.id} style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                          {productTitle}{li.variantTitle && li.variantTitle !== "Default Title" ? ` — ${li.variantTitle}` : ""}
                          {li.sku && <span style={{ fontWeight: 400, color: "#9ca3af" }}> · {li.sku}</span>}
                        </span>
                        <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{li.quantityReceived} / {li.quantityOrdered} received</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <label style={{ fontSize: 12, color: "#6b7280" }}>
                          Qty received
                          <input
                            type="number" min={0} max={remaining}
                            value={quantities[li.id] ?? "0"}
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [li.id]: e.target.value }))}
                            style={{ display: "block", width: 90, marginTop: 4, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
                          />
                        </label>
                        {li.locationId ? (
                          <span style={{ fontSize: 12, color: "#6b7280" }}>{li.locationName ?? "Assigned location"}</span>
                        ) : (
                          <>
                            {li.locations.length > 1 && (
                              <label style={{ fontSize: 12, color: "#6b7280", flex: 1, minWidth: 160 }}>
                                Location
                                <select
                                  value={locationEdits[li.id] ?? ""}
                                  onChange={(e) => setLocationEdits((prev) => ({ ...prev, [li.id]: e.target.value }))}
                                  style={{ display: "block", width: "100%", marginTop: 4, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 8px", fontSize: 13 }}
                                >
                                  <option value="">Choose location…</option>
                                  {li.locations.map((loc) => (
                                    <option key={loc.id} value={loc.id}>{loc.name} ({loc.available} available)</option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {li.locations.length === 0 && (
                              <span style={{ fontSize: 11, color: "#991b1b" }}>No location found</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!isDraft && !canReceive && (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>No further actions available for this purchase order.</p>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
            Close
          </button>
          {isDraft && (
            <button type="button" onClick={saveChanges} disabled={busy}
              style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: busy ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
              {editFetcher.state !== "idle" ? "Saving…" : "Save Changes"}
            </button>
          )}
          {canResend && (
            <button type="button" onClick={() => act("send_to_supplier")} disabled={busy}
              style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: busy ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
              {busy && lastActionIntent === "send_to_supplier" ? "Sending…" : "Resend to Supplier"}
            </button>
          )}
          {isDraft && (
            <button
              type="button" onClick={orderNow} disabled={busy || !hasValidLine}
              title={!hasValidLine ? "Set a quantity greater than zero on at least one item." : undefined}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: busy || !hasValidLine ? "#9ca3af" : "#111827", color: "#fff", cursor: busy || !hasValidLine ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}
            >
              {busy && lastActionIntent === "order_now" ? "Ordering…" : "Order Now"}
            </button>
          )}
          {canReceive && (
            <button
              type="button" onClick={handleReceive} disabled={busy || locationMissing}
              title={locationMissing ? "Choose a location for every item you're receiving." : undefined}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: busy || locationMissing ? "#9ca3af" : "#059669", color: "#fff", cursor: busy || locationMissing ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}
            >
              {busy && lastActionIntent === "receive_items" ? "Receiving…" : "Receive Items"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
