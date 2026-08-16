import { format } from "date-fns";
import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";
import { useDashboardStore } from "../../stores/dashboard-store";

// Hand-rolled decorative scene (laptop + checklist + checkmark badge) — the
// design reference's illustration, reproduced as plain geometric shapes
// (rects/ellipse/paths), no external asset. Purely decorative, same
// treatment as every other icon in this codebase.
function RecommendedActionIllustration() {
  return (
    <svg viewBox="0 0 150 118" width={150} height={118} style={{ flexShrink: 0 }}>
      <ellipse cx="72" cy="106" rx="58" ry="8" fill="#d9d0fb" />
      <rect x="26" y="72" width="86" height="28" rx="6" fill="#8b6bff" />
      <rect x="34" y="60" width="70" height="16" rx="5" fill="#a58cff" />
      <rect x="40" y="16" width="60" height="52" rx="6" fill="#ffffff" stroke="#ded6fb" />
      <g stroke="#6d4aff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M47 28l3.4 3.4L57 25" /><path d="M47 41l3.4 3.4L57 38" /><path d="M47 54l3.4 3.4L57 51" />
      </g>
      <g stroke="#cfc4f6" strokeWidth="3" strokeLinecap="round"><path d="M64 29h28M64 42h28M64 55h20" /></g>
      <circle cx="106" cy="82" r="20" fill="#6d4aff" />
      <path d="M98 82l6 6 12-13" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Enterprise/PO-capable plans: shows the single most urgent reorder
// candidate (smallest stockOutDays across every supplier, see
// pickTopRecommendedLine in dashboard-data.server.ts) with its real
// suggested quantity and order-by date — "Create Purchase Order" and "View
// Forecast" both go to that product's own detail page, where the real
// purchase-order flow and Demand Forecast section already live (?openPO=1
// auto-opens the modal there, #demand-forecast scrolls to the chart).
//
// Other plans (no supplier/PO flow to recommend into) keep the aggregate
// "N products will stock out soon" framing this banner already had.
//
// Always renders something in this slot — a loading skeleton, then either a
// real recommendation or an explicit "no action needed" note — rather than
// collapsing to nothing, so the section doesn't read as missing when there's
// genuinely nothing to flag.
export function RecommendedActionBanner() {
  const navigate = useShopAwareNavigate();
  const loading = useDashboardStore((s) => s.data === null);
  const topProduct = useDashboardStore((s) => s.data?.topRecommendedProduct) ?? null;
  const stockOutSoonCount = useDashboardStore((s) => s.data?.stockOutSoonCount) ?? 0;

  if (loading) {
    return <div className="skeleton-text" style={{ marginTop: 16, height: 118, borderRadius: 18 }} />;
  }

  // topRecommendedProduct is only ever non-null on plans that can place a
  // PO (see dashboard-data.server.ts) — no separate plan check needed here.
  if (topProduct) {
    const orderByLabel = topProduct.orderByDate ? format(new Date(`${topProduct.orderByDate}T00:00:00`), "MMM d") : null;
    return (
      <div style={{ marginTop: 16, border: "1px solid #e0daf8", borderRadius: 18, background: "#f2eeff", padding: "20px 22px", display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        <RecommendedActionIllustration />
        <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4b4a63" }}>Recommended Action</div>
          <div style={{ fontSize: 17.5, fontWeight: 800, letterSpacing: "-.3px", color: "#15151f" }}>
            Reorder {topProduct.recommendedQuantity} unit{topProduct.recommendedQuantity === 1 ? "" : "s"} of {topProduct.productTitle ?? "this product"}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 500, color: "#6b6a80", lineHeight: 1.7, marginTop: 4 }}>
            Based on demand forecast, stock will run out{topProduct.stockOutDays !== null ? ` in ${topProduct.stockOutDays} day${topProduct.stockOutDays === 1 ? "" : "s"}` : ""}.
            <br />
            {orderByLabel ? `Place an order by ${orderByLabel} to avoid a stockout.` : "Placing an order now ensures you don't miss sales."}
          </div>
        </div>
        <div style={{ flexShrink: 0, width: 210, display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={() => navigate(`/app/products/${topProduct.productId}?openPO=1`)}
            style={{ border: "none", cursor: "pointer", background: "#6d4aff", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "13px 16px", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 8px 18px -8px rgba(109,74,255,.7)" }}
          >
            <span style={{ whiteSpace: "nowrap" }}>Create Purchase Order</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
          <button
            onClick={() => navigate(`/app/products/${topProduct.productId}#demand-forecast`)}
            style={{ cursor: "pointer", background: "#fff", border: "1px solid #dcd6f5", color: "#2b2a3c", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "13px 16px", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 9 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            <span>View Forecast</span>
          </button>
        </div>
      </div>
    );
  }

  if (stockOutSoonCount === 0) {
    return (
      <div style={{ marginTop: 16, border: "1px solid #e0daf8", borderRadius: 18, background: "#f2eeff", padding: "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e6ddff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4b4a63" }}>Recommended Action</div>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#15151f", marginTop: 2 }}>No action needed right now</div>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6b6a80" }}>
            Nothing is projected to run low soon — you&apos;re all caught up.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, border: "1px solid #e0daf8", borderRadius: 18, background: "#f2eeff", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#e6ddff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#4b4a63" }}>Recommended Action</div>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: "#15151f", marginTop: 2 }}>
            {stockOutSoonCount} product{stockOutSoonCount !== 1 ? "s" : ""} will stock out within 7 days
          </div>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6b6a80" }}>
            Based on your 30-day sales velocity. Run a sync to refresh predictions.
          </p>
        </div>
      </div>
      <button
        onClick={() => navigate("/app/products")}
        style={{ flexShrink: 0, border: "none", cursor: "pointer", background: "#6d4aff", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 700, padding: "11px 16px", borderRadius: 11, whiteSpace: "nowrap", boxShadow: "0 8px 18px -8px rgba(109,74,255,.7)" }}
      >
        View products →
      </button>
    </div>
  );
}
