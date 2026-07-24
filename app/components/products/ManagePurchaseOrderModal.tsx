import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher } from "react-router";
import { STATUS_STYLE } from "../purchase-orders/PurchaseOrderList";
import type { ProductPurchaseOrderRow } from "../../lib/product-detail.server";

type ActionResult = { success: boolean; error?: string; intent?: string };

// One modal for every PO-lifecycle action, opened from a single "Edit"
// button per row instead of a cluttered row of separate buttons. Stays open
// across "Send to Supplier"/"Mark as Ordered" (just revalidates so `po`'s
// status flows back in via props and the modal re-renders for the next
// step) and only closes after a successful receive or an explicit Close —
// receiving is the natural end of the one-by-one flow.
export function ManagePurchaseOrderModal({
  po,
  onClose,
  onChanged,
}: {
  po: ProductPurchaseOrderRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const fetcher = useFetcher<ActionResult>();
  const busy = fetcher.state !== "idle";
  const lastIntent = fetcher.data?.intent;

  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(po.lineItems.map((li) => [li.id, String(Math.max(0, li.quantityOrdered - li.quantityReceived))])),
  );
  const [locationEdits, setLocationEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(po.lineItems.map((li) => [li.id, li.locations.length === 1 ? li.locations[0].id : ""])),
  );

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data?.success) return;
    onChanged();
    if (fetcher.data.intent === "receive_items") onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  function act(intent: string) {
    fetcher.submit({ intent }, { method: "post", action: `/app/purchase-orders/${po.id}` });
  }

  const canSend = po.status === "draft" || po.status === "ordered";
  const canMarkOrdered = po.status === "draft";
  const canReceive = po.status === "ordered" || po.status === "partially_received";

  const locationMissing = po.lineItems.some((li) => {
    const qty = Math.max(0, parseInt(quantities[li.id] ?? "0") || 0);
    return qty > 0 && !li.locationId && li.locations.length > 1 && !locationEdits[li.id];
  });

  function handleReceive() {
    const receipts = po.lineItems
      .map((li) => ({
        lineItemId: li.id,
        quantityReceived: Math.max(0, parseInt(quantities[li.id] ?? "0") || 0),
        locationId: locationEdits[li.id] || undefined,
      }))
      .filter((r) => r.quantityReceived > 0);
    if (receipts.length === 0) return;
    fetcher.submit(
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
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>PO #{po.poNumber}</p>
            <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px" }}>
          {fetcher.data && !fetcher.data.success && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
              {fetcher.data.error}
            </div>
          )}

          {(canSend || canMarkOrdered) && (
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {canSend && (
                <button type="button" onClick={() => act("send_to_supplier")} disabled={busy}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
                  {busy && lastIntent === "send_to_supplier" ? "Sending…" : "Send to Supplier"}
                </button>
              )}
              {canMarkOrdered && (
                <button type="button" onClick={() => act("mark_ordered")} disabled={busy}
                  style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: busy ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600 }}>
                  {busy && lastIntent === "mark_ordered" ? "Updating…" : "Mark as Ordered"}
                </button>
              )}
            </div>
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
                          {li.variantTitle ?? "Default"}
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

          {!canSend && !canMarkOrdered && !canReceive && (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>No further actions available for this purchase order.</p>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={busy}
            style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
            Close
          </button>
          {canReceive && (
            <button
              type="button" onClick={handleReceive} disabled={busy || locationMissing}
              title={locationMissing ? "Choose a location for every item you're receiving." : undefined}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: busy || locationMissing ? "#9ca3af" : "#059669", color: "#fff", cursor: busy || locationMissing ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}
            >
              {busy && lastIntent === "receive_items" ? "Receiving…" : "Receive Items"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
