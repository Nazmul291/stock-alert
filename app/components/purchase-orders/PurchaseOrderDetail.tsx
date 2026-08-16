import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import { StatusPill } from "../StatusPill";
import { STATUS_STYLE } from "./PurchaseOrderList";
import { buildReceiptDrafts, isReceiveLocationMissing } from "../../lib/purchase-order-receive";

export type PurchaseOrderDetailData = {
  id: string;
  poNumber: number;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  totalCost: number | null;
  referenceNumber: string | null;
  supplierNote: string | null;
  terms: string | null;
  tags: string[];
  sentToSupplierAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    contactName: string | null;
    website: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
    paymentTerms: string | null;
    currency: string | null;
  };
  lineItems: {
    id: string;
    variantId: string;
    productTitle: string | null;
    variantTitle: string | null;
    sku: string | null;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number | null;
    // Set when this line already has a fixed destination location — from the
    // product-detail page's per-location Create Purchase Order flow. When
    // set, receiving shows this as plain text instead of the picker below.
    locationId: string | null;
    locationName: string | null;
    // Only used (and only populated) when locationId is null and the PO is
    // ordered/partially_received — a variant stocked at more than one
    // location needs the merchant to pick which one received the shipment
    // (see receivePurchaseOrderItems in purchase-order.server.ts for why this
    // can't be guessed).
    locations: { id: string; name: string; available: number }[];
  }[];
};

type ActionResult = { success: boolean; error?: string; intent?: string; message?: string };

export function PurchaseOrderDetail({ po }: { po: PurchaseOrderDetailData }) {
  const editFetcher = useFetcher<ActionResult>();
  const actionFetcher = useFetcher<ActionResult>();
  const navigate = useNavigate();

  const isDraft = po.status === "draft";
  const canReceive = po.status === "ordered" || po.status === "partially_received";
  // Draft sending now goes through "Order Now" below (save + order + email
  // in one step, matching ManagePurchaseOrderModal on the product page) —
  // this is only for resending once a PO is already past draft.
  const canSend = po.status === "ordered";
  const canCancel = po.status !== "received" && po.status !== "cancelled";

  const [lineEdits, setLineEdits] = useState<Record<string, { quantityOrdered: string; unitCost: string }>>(
    () => Object.fromEntries(po.lineItems.map((li) => [li.id, { quantityOrdered: String(li.quantityOrdered), unitCost: li.unitCost != null ? String(li.unitCost) : "" }])),
  );
  const [receiveEdits, setReceiveEdits] = useState<Record<string, string>>(
    () => Object.fromEntries(po.lineItems.map((li) => [li.id, String(Math.max(0, li.quantityOrdered - li.quantityReceived))])),
  );
  // Pre-selects the sole location when there's only one — the select only
  // renders (and only needs a merchant choice) when a variant has more than one.
  const [receiveLocationEdits, setReceiveLocationEdits] = useState<Record<string, string>>(
    () => Object.fromEntries(po.lineItems.map((li) => [li.id, li.locations.length === 1 ? li.locations[0].id : ""])),
  );
  const [referenceNumber, setReferenceNumber] = useState(po.referenceNumber ?? "");
  const [supplierNote, setSupplierNote] = useState(po.supplierNote ?? "");
  const [terms, setTerms] = useState(po.terms ?? "");
  const [tagsInput, setTagsInput] = useState(po.tags.join(", "));

  useEffect(() => {
    if (actionFetcher.state === "idle" && actionFetcher.data?.success) {
      navigate(".", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFetcher.state, actionFetcher.data]);

  const s = STATUS_STYLE[po.status];
  const busy = editFetcher.state !== "idle" || actionFetcher.state !== "idle";
  const missingCostCount = po.lineItems.filter((li) => li.unitCost == null).length;
  const hasValidLine = Object.values(lineEdits).some((e) => (parseInt(e.quantityOrdered) || 0) > 0);
  const lastActionIntent = actionFetcher.data?.intent;

  function currentLineItems() {
    return po.lineItems.map((li) => ({
      id: li.id,
      quantityOrdered: Math.max(0, parseInt(lineEdits[li.id]?.quantityOrdered ?? "0") || 0),
      unitCost: lineEdits[li.id]?.unitCost.trim() ? parseFloat(lineEdits[li.id].unitCost) : null,
    }));
  }
  function currentTags() {
    return tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
  }
  function orderNow() {
    actionFetcher.submit(
      {
        intent: "order_now",
        lineItems: JSON.stringify(currentLineItems()),
        referenceNumber,
        supplierNote,
        terms,
        tags: JSON.stringify(currentTags()),
      },
      { method: "post" },
    );
  }
  // Blocks submission client-side when a multi-location variant has a
  // pending receive quantity but no location chosen yet — the server
  // enforces this too (receivePurchaseOrderItems), this just avoids a
  // round trip for the common case of forgetting to pick one.
  const receiveLocationMissing = isReceiveLocationMissing(po.lineItems, receiveEdits, receiveLocationEdits);

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <StatusPill label={s.label} bg={s.bg} color={s.color} size="md" />
        {po.sentToSupplierAt && <span style={{ fontSize: 13, color: "#6b7280" }}>Sent to supplier {new Date(po.sentToSupplierAt).toLocaleDateString()}</span>}
        {po.receivedAt && <span style={{ fontSize: 13, color: "#6b7280" }}>Received {new Date(po.receivedAt).toLocaleDateString()}</span>}
      </div>

      {(editFetcher.data && !editFetcher.data.success) || (actionFetcher.data && !actionFetcher.data.success) ? (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
          {editFetcher.data?.error || actionFetcher.data?.error}
        </div>
      ) : null}

      <div style={{ marginBottom: 16, padding: "12px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
          <strong>Supplier:</strong> {po.supplier.name} {po.supplier.email ? `(${po.supplier.email})` : "— no email on file"}
        </p>
        {po.supplier.contactName && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>
            <strong>Contact:</strong> {po.supplier.contactName}{po.supplier.phone ? ` · ${po.supplier.phone}` : ""}
          </p>
        )}
        {(po.supplier.address1 || po.supplier.city || po.supplier.country) && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>
            <strong>Address:</strong> {[po.supplier.address1, po.supplier.address2, po.supplier.city, po.supplier.province, po.supplier.zip, po.supplier.country].filter(Boolean).join(", ")}
          </p>
        )}
        {po.supplier.website && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>
            <strong>Website:</strong> <a href={po.supplier.website} target="_blank" rel="noreferrer">{po.supplier.website}</a>
          </p>
        )}
        {(po.supplier.paymentTerms || po.supplier.currency) && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#374151" }}>
            {po.supplier.paymentTerms && <><strong>Payment terms:</strong> {po.supplier.paymentTerms}</>}
            {po.supplier.paymentTerms && po.supplier.currency ? " · " : ""}
            {po.supplier.currency && <><strong>Currency:</strong> {po.supplier.currency}</>}
          </p>
        )}
      </div>

      <div style={{ marginBottom: 16, padding: "12px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#111827" }}>Purchase order details</p>
        {isDraft ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Reference number</label>
              <input
                type="text" maxLength={255} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Note to supplier</label>
              <textarea
                rows={2} maxLength={5000} value={supplierNote} onChange={(e) => setSupplierNote(e.target.value)}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical" }}
              />
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Terms</label>
                <input
                  type="text" value={terms} onChange={(e) => setTerms(e.target.value)}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Tags</label>
                <input
                  type="text" placeholder="Comma separated" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            {po.referenceNumber && <p style={{ margin: "0 0 4px", fontSize: 13, color: "#374151" }}><strong>Reference:</strong> {po.referenceNumber}</p>}
            {po.supplierNote && <p style={{ margin: "0 0 4px", fontSize: 13, color: "#374151" }}><strong>Note to supplier:</strong> {po.supplierNote}</p>}
            {po.terms && <p style={{ margin: "0 0 4px", fontSize: 13, color: "#374151" }}><strong>Terms:</strong> {po.terms}</p>}
            {po.tags.length > 0 && <p style={{ margin: 0, fontSize: 13, color: "#374151" }}><strong>Tags:</strong> {po.tags.join(", ")}</p>}
            {!po.referenceNumber && !po.supplierNote && !po.terms && po.tags.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>No additional details.</p>
            )}
          </>
        )}
      </div>

      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
              {["Product", "SKU", "Qty Ordered", "Unit Cost", "Received", ...(canReceive ? ["Receive Now"] : [])].map((label) => (
                <th key={label} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151" }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((li) => (
              <tr key={li.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 12px" }}>
                  {li.productTitle ?? "—"}{li.variantTitle && li.variantTitle !== "Default Title" ? ` — ${li.variantTitle}` : ""}
                  {li.locationName && <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>{li.locationName}</span>}
                </td>
                <td style={{ padding: "8px 12px", color: "#6b7280" }}>{li.sku ?? "—"}</td>
                <td style={{ padding: "8px 12px" }}>
                  {isDraft ? (
                    <input
                      type="number" min={0}
                      value={lineEdits[li.id]?.quantityOrdered ?? "0"}
                      onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], quantityOrdered: e.target.value } }))}
                      style={{ width: 70, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                    />
                  ) : li.quantityOrdered}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {isDraft ? (
                    <input
                      type="number" min={0} step={0.01}
                      value={lineEdits[li.id]?.unitCost ?? ""}
                      onChange={(e) => setLineEdits((prev) => ({ ...prev, [li.id]: { ...prev[li.id], unitCost: e.target.value } }))}
                      style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                    />
                  ) : li.unitCost != null ? `$${li.unitCost.toFixed(2)}` : "—"}
                </td>
                <td style={{ padding: "8px 12px" }}>{li.quantityReceived} / {li.quantityOrdered}</td>
                {canReceive && (
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input
                        type="number" min={0} max={Math.max(0, li.quantityOrdered - li.quantityReceived)}
                        value={receiveEdits[li.id] ?? "0"}
                        onChange={(e) => setReceiveEdits((prev) => ({ ...prev, [li.id]: e.target.value }))}
                        style={{ width: 70, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                      />
                      {li.locationId ? (
                        <span style={{ fontSize: 11, color: "#6b7280" }}>{li.locationName ?? "Assigned location"}</span>
                      ) : (
                        <>
                          {li.locations.length > 1 && (
                            <select
                              value={receiveLocationEdits[li.id] ?? ""}
                              onChange={(e) => setReceiveLocationEdits((prev) => ({ ...prev, [li.id]: e.target.value }))}
                              style={{ width: 150, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 6px", fontSize: 12 }}
                            >
                              <option value="">Choose location…</option>
                              {li.locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>{loc.name} ({loc.available} available)</option>
                              ))}
                            </select>
                          )}
                          {li.locations.length === 0 && (
                            <span style={{ fontSize: 11, color: "#991b1b" }}>No location found</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Total: {po.totalCost != null ? `$${po.totalCost.toFixed(2)}` : "—"}
      </p>
      {missingCostCount > 0 && (
        <p style={{ fontSize: 12, color: "#92400e", marginBottom: 20 }}>
          Excludes {missingCostCount} item{missingCostCount !== 1 ? "s" : ""} with no unit cost set — the total above is incomplete.
        </p>
      )}
      {missingCostCount === 0 && <div style={{ marginBottom: 20 }} />}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {isDraft && (
          <button
            type="button" disabled={busy}
            onClick={() => {
              editFetcher.submit(
                {
                  intent: "update_line_items",
                  lineItems: JSON.stringify(currentLineItems()),
                  referenceNumber,
                  supplierNote,
                  terms,
                  tags: JSON.stringify(currentTags()),
                },
                { method: "post" },
              );
            }}
            style={btnStyle(busy, "#fff", "#374151", "1px solid #d1d5db")}
          >
            {editFetcher.state !== "idle" ? "Saving…" : "Save Changes"}
          </button>
        )}
        {isDraft && (
          <button
            type="button" onClick={orderNow} disabled={busy || !hasValidLine}
            title={!hasValidLine ? "Set a quantity greater than zero on at least one item." : undefined}
            style={btnStyle(busy || !hasValidLine, "#111827", "#fff")}
          >
            {busy && lastActionIntent === "order_now" ? "Ordering…" : "Order Now"}
          </button>
        )}
        {canSend && (
          <button
            type="button" disabled={busy}
            onClick={() => actionFetcher.submit({ intent: "send_to_supplier" }, { method: "post" })}
            style={btnStyle(busy, "#fff", "#111827", "1px solid #d1d5db")}
          >
            {po.sentToSupplierAt ? "Resend to Supplier" : "Send to Supplier"}
          </button>
        )}
        {canReceive && (
          <button
            type="button" disabled={busy || receiveLocationMissing}
            onClick={() => {
              const receipts = buildReceiptDrafts(po.lineItems, receiveEdits, receiveLocationEdits);
              if (receipts.length === 0) return;
              actionFetcher.submit({ intent: "receive_items", receipts: JSON.stringify(receipts) }, { method: "post" });
            }}
            style={btnStyle(busy || receiveLocationMissing, "#059669", "#fff")}
            title={receiveLocationMissing ? "Choose a location for every item you're receiving." : undefined}
          >
            Receive Items
          </button>
        )}
        {canCancel && (
          <button
            type="button" disabled={busy}
            onClick={() => {
              if (!window.confirm(`Cancel PO #${po.poNumber}?`)) return;
              actionFetcher.submit({ intent: "cancel_po" }, { method: "post" });
            }}
            style={btnStyle(busy, "#fff", "#991b1b", "1px solid #fca5a5")}
          >
            Cancel PO
          </button>
        )}
      </div>
    </div>
  );
}

function btnStyle(disabled: boolean, bg: string, color: string, border = "none") {
  return {
    padding: "9px 18px", borderRadius: 8, border,
    background: disabled ? "#9ca3af" : bg, color,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600,
  } as const;
}
