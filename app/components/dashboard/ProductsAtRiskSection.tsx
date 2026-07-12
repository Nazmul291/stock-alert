import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";
import { useDashboardStore } from "../../stores/dashboard-store";

// Shown in place of real rows while loading — always reserved (per the
// section-level `loading ||` gate in app._index.tsx) since we don't yet know
// whether any products are actually at risk.
const PLACEHOLDER_ROWS = Array.from({ length: 3 }, (_, i) => ({
  productId: `skeleton-${i}`,
  productTitle: "Product name",
  sku: null as string | null,
  currentQuantity: 0,
  inventoryStatus: "low_stock",
}));

export function ProductsAtRiskSection() {
  const navigate = useShopAwareNavigate();
  const loading = useDashboardStore((s) => s.data === null);
  const products = useDashboardStore((s) => s.data?.atRiskProducts) ?? [];
  const rows = loading ? PLACEHOLDER_ROWS : products;

  return (
    <s-section heading="Products at Risk">
      <s-link slot="primary-action" href="/app/products?filter=out_of_stock">View all →</s-link>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((p) => {
          const isOut = p.inventoryStatus === "out_of_stock";
          return (
            <div
              key={p.productId}
              role="button" tabIndex={0}
              onClick={() => !loading && navigate("/app/products?filter=out_of_stock")}
              onKeyDown={(e) => !loading && e.key === "Enter" && navigate("/app/products?filter=out_of_stock")}
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 6, padding: "10px 14px", cursor: loading ? "default" : "pointer",
                // Neutral while loading — we don't actually know yet whether
                // these are at-risk, so don't paint them with the "low
                // stock"/"out of stock" warning colors until real data says so.
                background: loading ? "#f9fafb" : isOut ? "#fff5f5" : "#fffbeb",
                border: `1px solid ${loading ? "#e5e7eb" : isOut ? "#fca5a5" : "#fde68a"}`,
              }}
            >
              <div>
                <span className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{p.productTitle ?? "—"}</span>
                {p.sku && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>SKU: {p.sku}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 700, fontSize: 18, color: loading ? "#6b7280" : isOut ? "#dc2626" : "#d97706" }}>
                  {p.currentQuantity}
                </span>
                <span
                  className={loading ? "skeleton-text" : undefined}
                  style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 10, fontWeight: 600, whiteSpace: "nowrap",
                    background: loading ? "#f3f4f6" : isOut ? "#fee2e2" : "#fef3c7",
                    color: loading ? "#6b7280" : isOut ? "#991b1b" : "#92400e",
                  }}
                >
                  {isOut ? "Out of Stock" : "Low Stock"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </s-section>
  );
}
