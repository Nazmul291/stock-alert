import { format } from "date-fns";
import { Link } from "react-router";
import type { ProductHistoryEntry } from "../../lib/product-detail.server";
import { STATUS_STYLE as PO_STATUS_STYLE } from "../purchase-orders/PurchaseOrderList";

const ALERT_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  low_stock: { bg: "#fef3c7", color: "#92400e", label: "Low Stock Alert" },
  out_of_stock: { bg: "#fee2e2", color: "#991b1b", label: "Out of Stock Alert" },
  restock: { bg: "#d1fae5", color: "#065f46", label: "Back in Stock" },
};

const PO_EVENT_LABEL: Record<string, string> = {
  created: "Purchase order created",
  sent: "Sent to supplier",
  ordered: "Marked as ordered",
  received: "Items received",
};

export function ProductHistoryTimeline({ history }: { history: ProductHistoryEntry[] }) {
  if (history.length === 0) {
    return <p style={{ fontSize: 13, color: "#9ca3af" }}>No activity yet — stock alerts and purchase order events for this product will show up here.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {history.map((entry, i) => {
        if (entry.type === "alert") {
          const style = ALERT_STYLE[entry.alertType ?? ""] ?? { bg: "#f3f4f6", color: "#374151", label: "Alert" };
          return (
            <div key={`alert-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#111827" }}>{style.label}</p>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                  {entry.variantTitle ? `${entry.variantTitle} — ` : ""}
                  {entry.quantityAtAlert != null ? `${entry.quantityAtAlert} units` : "—"}
                </p>
              </div>
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, fontWeight: 500, background: style.bg, color: style.color, whiteSpace: "nowrap" }}>
                {format(new Date(entry.at), "MMM d, h:mm a")}
              </span>
            </div>
          );
        }

        const poStyle = PO_STATUS_STYLE[entry.status];
        return (
          <div key={`po-${entry.poId}-${entry.event}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#111827" }}>
                {PO_EVENT_LABEL[entry.event]} — <Link to={`/app/purchase-orders/${entry.poId}`} style={{ color: "#1e40af" }}>PO #{entry.poNumber}</Link>
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                {entry.supplierName} · {entry.quantityOrdered} ordered
                {entry.quantityReceived > 0 ? `, ${entry.quantityReceived} received` : ""}
              </p>
            </div>
            <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 12, fontWeight: 500, background: poStyle.bg, color: poStyle.color, whiteSpace: "nowrap" }}>
              {format(new Date(entry.at), "MMM d, h:mm a")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
