import { useState } from "react";
import { Link } from "react-router";
import { STATUS_STYLE } from "../purchase-orders/PurchaseOrderList";
import type { ProductPurchaseOrderRow } from "../../lib/product-detail.server";
import { ManagePurchaseOrderModal } from "./ManagePurchaseOrderModal";
import { useLiveEventsStore } from "../../stores/live-events-store";
import { StatusPill } from "../StatusPill";

// Completed purchase orders (received/cancelled) are already covered by the
// History timeline below this list — this table is only for orders that
// still need attention (draft/ordered/partially received).
const PENDING_STATUSES = new Set(["draft", "ordered", "partially_received"]);

// A single "Edit" button opens ManagePurchaseOrderModal, which holds every
// lifecycle action (send to supplier, mark as ordered, receive items) for
// that PO — instead of a row cluttered with one button per possible action.
function PendingPoRow({ po, suppliers, productTitle }: { po: ProductPurchaseOrderRow; suppliers: { id: string; name: string }[]; productTitle: string }) {
  const bumpLiveEvents = useLiveEventsStore((s) => s.bump);
  const [showManage, setShowManage] = useState(false);
  const s = STATUS_STYLE[po.status];

  return (
    <tr style={{ borderBottom: "1px solid #f9fafb" }}>
      <td style={{ padding: "8px" }}>
        <Link to={`/app/purchase-orders/${po.id}`} style={{ color: "#1e40af", fontWeight: 600 }}>#{po.poNumber}</Link>
      </td>
      <td style={{ padding: "8px" }}>
        <StatusPill label={s.label} bg={s.bg} color={s.color} />
      </td>
      <td style={{ padding: "8px", color: "#374151" }}>{po.supplierName}</td>
      <td style={{ padding: "8px" }}>{po.quantityOrdered}</td>
      <td style={{ padding: "8px" }}>{po.quantityReceived}</td>
      <td style={{ padding: "8px", color: "#6b7280" }}>{new Date(po.createdAt).toLocaleDateString()}</td>
      <td style={{ padding: "8px" }}>
        <button
          type="button" onClick={() => setShowManage(true)}
          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}
        >
          Edit
        </button>
      </td>

      {showManage && (
        <ManagePurchaseOrderModal
          po={po}
          suppliers={suppliers}
          productTitle={productTitle}
          onClose={() => setShowManage(false)}
          onChanged={() => bumpLiveEvents(["product-detail"])}
        />
      )}
    </tr>
  );
}

// Skeleton row rendered instead of PendingPoRow while loading — a plain,
// non-interactive row (no modal, no live-events subscription) so there's
// nothing real for the placeholder "Edit" action to open.
function PendingPoSkeletonRow({ id }: { id: string }) {
  return (
    <tr key={id} style={{ borderBottom: "1px solid #f9fafb" }}>
      <td style={{ padding: "8px" }}><span className="skeleton-text">#0000</span></td>
      <td style={{ padding: "8px" }}><span className="skeleton-text" style={{ padding: "2px 8px", borderRadius: 12 }}>Status</span></td>
      <td style={{ padding: "8px" }}><span className="skeleton-text">Supplier name</span></td>
      <td style={{ padding: "8px" }}><span className="skeleton-text">00</span></td>
      <td style={{ padding: "8px" }}><span className="skeleton-text">00</span></td>
      <td style={{ padding: "8px" }}><span className="skeleton-text">Jan 1, 2026</span></td>
      <td style={{ padding: "8px" }}><span className="skeleton-text">Edit</span></td>
    </tr>
  );
}

const PLACEHOLDER_ROW_IDS = ["skeleton-0", "skeleton-1"];

export function ProductPurchaseOrdersList({ purchaseOrders, suppliers, productTitle, loading = false }: {
  purchaseOrders: ProductPurchaseOrderRow[];
  suppliers: { id: string; name: string }[];
  productTitle: string;
  loading?: boolean;
}) {
  const pending = purchaseOrders.filter((po) => PENDING_STATUSES.has(po.status));

  if (!loading && pending.length === 0) {
    return <p style={{ fontSize: 13, color: "#9ca3af" }}>No pending purchase orders for this product.</p>;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
            {["PO #", "Status", "Supplier", "Ordered", "Received", "Date", "Actions"].map((label) => (
              <th key={label} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? PLACEHOLDER_ROW_IDS.map((id) => <PendingPoSkeletonRow key={id} id={id} />)
            : pending.map((po) => <PendingPoRow key={po.id} po={po} suppliers={suppliers} productTitle={productTitle} />)}
        </tbody>
      </table>
    </div>
  );
}
