import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

export type PurchaseOrderDetailData = {
  id: string;
  poNumber: number;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  totalCost: number | null;
  sentToSupplierAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  supplier: { id: string; name: string; email: string | null };
  lineItems: {
    id: string;
    variantId: string;
    productTitle: string | null;
    variantTitle: string | null;
    sku: string | null;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number | null;
  }[];
};

type ActionResult = { success: boolean; error?: string; intent?: string; message?: string };

const STATUS_STYLE: Record<PurchaseOrderDetailData["status"], { bg: string; color: string; label: string }> = {
  draft: { bg: "#f3f4f6", color: "#374151", label: "Draft" },
  ordered: { bg: "#dbeafe", color: "#1e40af", label: "Ordered" },
  partially_received: { bg: "#fef3c7", color: "#92400e", label: "Partially Received" },
  received: { bg: "#d1fae5", color: "#065f46", label: "Received" },
  cancelled: { bg: "#fee2e2", color: "#991b1b", label: "Cancelled" },
};

export function PurchaseOrderDetail({ po }: { po: PurchaseOrderDetailData }) {
  const editFetcher = useFetcher<ActionResult>();
  const actionFetcher = useFetcher<ActionResult>();
  const navigate = useNavigate();

  const isDraft = po.status === "draft";
  const canReceive = po.status === "ordered" || po.status === "partially_received";
  const canSend = po.status === "draft" || po.status === "ordered";
  const canCancel = po.status !== "received" && po.status !== "cancelled";

  const [lineEdits, setLineEdits] = useState<Record<string, { quantityOrdered: string; unitCost: string }>>(
    () => Object.fromEntries(po.lineItems.map((li) => [li.id, { quantityOrdered: String(li.quantityOrdered), unitCost: li.unitCost != null ? String(li.unitCost) : "" }])),
  );
  const [receiveEdits, setReceiveEdits] = useState<Record<string, string>>(
    () => Object.fromEntries(po.lineItems.map((li) => [li.id, String(Math.max(0, li.quantityOrdered - li.quantityReceived))])),
  );

  useEffect(() => {
    if (actionFetcher.state === "idle" && actionFetcher.data?.success) {
      navigate(".", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFetcher.state, actionFetcher.data]);

  const s = STATUS_STYLE[po.status];
  const busy = editFetcher.state !== "idle" || actionFetcher.state !== "idle";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ background: s.bg, color: s.color, padding: "4px 10px", borderRadius: 12, fontSize: 13, fontWeight: 600 }}>{s.label}</span>
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
                <td style={{ padding: "8px 12px" }}>{li.productTitle ?? "—"}{li.variantTitle ? ` — ${li.variantTitle}` : ""}</td>
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
                    <input
                      type="number" min={0} max={Math.max(0, li.quantityOrdered - li.quantityReceived)}
                      value={receiveEdits[li.id] ?? "0"}
                      onChange={(e) => setReceiveEdits((prev) => ({ ...prev, [li.id]: e.target.value }))}
                      style={{ width: 70, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
        Total: {po.totalCost != null ? `$${po.totalCost.toFixed(2)}` : "—"}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {isDraft && (
          <button
            type="button" disabled={busy}
            onClick={() => {
              const lineItems = po.lineItems.map((li) => ({
                id: li.id,
                quantityOrdered: Math.max(0, parseInt(lineEdits[li.id]?.quantityOrdered ?? "0") || 0),
                unitCost: lineEdits[li.id]?.unitCost.trim() ? parseFloat(lineEdits[li.id].unitCost) : null,
              }));
              editFetcher.submit({ intent: "update_line_items", lineItems: JSON.stringify(lineItems) }, { method: "post" });
            }}
            style={btnStyle(busy, "#111827", "#fff")}
          >
            Save Changes
          </button>
        )}
        {isDraft && (
          <button
            type="button" disabled={busy}
            onClick={() => actionFetcher.submit({ intent: "mark_ordered" }, { method: "post" })}
            style={btnStyle(busy, "#059669", "#fff")}
          >
            Mark as Ordered
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
            type="button" disabled={busy}
            onClick={() => {
              const receipts = po.lineItems
                .map((li) => ({ lineItemId: li.id, quantityReceived: Math.max(0, parseInt(receiveEdits[li.id] ?? "0") || 0) }))
                .filter((r) => r.quantityReceived > 0);
              if (receipts.length === 0) return;
              actionFetcher.submit({ intent: "receive_items", receipts: JSON.stringify(receipts) }, { method: "post" });
            }}
            style={btnStyle(busy, "#059669", "#fff")}
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
