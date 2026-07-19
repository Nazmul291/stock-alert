import { Link, useFetcher } from "react-router";

export type PurchaseOrderRow = {
  id: string;
  poNumber: number;
  supplierName: string;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  lineItemCount: number;
  totalCost: number | null;
  createdAt: string;
};

const STATUS_STYLE: Record<PurchaseOrderRow["status"], { bg: string; color: string; label: string }> = {
  draft: { bg: "#f3f4f6", color: "#374151", label: "Draft" },
  ordered: { bg: "#dbeafe", color: "#1e40af", label: "Ordered" },
  partially_received: { bg: "#fef3c7", color: "#92400e", label: "Partially Received" },
  received: { bg: "#d1fae5", color: "#065f46", label: "Received" },
  cancelled: { bg: "#fee2e2", color: "#991b1b", label: "Cancelled" },
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "ordered", label: "Ordered" },
  { key: "partially_received", label: "Partially Received" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export function PurchaseOrderList({ orders, activeStatus }: { orders: PurchaseOrderRow[]; activeStatus: string }) {
  const cancelFetcher = useFetcher<{ success: boolean; error?: string }>();

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e5e7eb", overflowX: "auto" }}>
        {FILTER_TABS.map((tab) => (
          <Link
            key={tab.key}
            to={tab.key === "all" ? "/app/purchase-orders" : `/app/purchase-orders?status=${tab.key}`}
            style={{
              padding: "8px 14px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap",
              color: activeStatus === tab.key ? "#111827" : "#6b7280",
              fontWeight: activeStatus === tab.key ? 600 : 400,
              borderBottom: activeStatus === tab.key ? "2px solid #111827" : "2px solid transparent",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {cancelFetcher.data && !cancelFetcher.data.success && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#991b1b", fontSize: 13 }}>
          {cancelFetcher.data.error}
        </div>
      )}

      {orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
          <p style={{ fontSize: 16, marginBottom: 4 }}>No purchase orders found.</p>
          <p style={{ fontSize: 14 }}>Click &quot;Create Purchase Order&quot; to get started.</p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                {["PO #", "Supplier", "Status", "Items", "Total Cost", "Created", "Actions"].map((label) => (
                  <th key={label} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => {
                const s = STATUS_STYLE[po.status];
                const canCancel = po.status === "draft" || po.status === "ordered";
                return (
                  <tr key={po.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "10px 12px" }}>
                      <Link to={`/app/purchase-orders/${po.id}`} style={{ color: "#111827", fontWeight: 600, textDecoration: "none" }}>
                        #{po.poNumber}
                      </Link>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{po.supplierName}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                        {s.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{po.lineItemCount}</td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>{po.totalCost != null ? `$${po.totalCost.toFixed(2)}` : "—"}</td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>{new Date(po.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Link to={`/app/purchase-orders/${po.id}`} style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 10px", color: "#374151", fontSize: 13, textDecoration: "none" }}>
                          View
                        </Link>
                        {canCancel && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Cancel PO #${po.poNumber}?`)) return;
                              cancelFetcher.submit({ intent: "cancel_po", id: po.id }, { method: "post" });
                            }}
                            disabled={cancelFetcher.state !== "idle"}
                            style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 6, padding: "5px 10px", cursor: cancelFetcher.state !== "idle" ? "not-allowed" : "pointer", color: "#991b1b", fontSize: 13 }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
