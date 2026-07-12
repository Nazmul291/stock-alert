import type { DashboardData } from "../lib/dashboard-data.server";
import { useShopAwareNavigate } from "../lib/use-shop-aware-navigate";

export function ProductsAtRiskSection({ products }: { products: DashboardData["atRiskProducts"] }) {
  const navigate = useShopAwareNavigate();

  return (
    <s-section heading="Products at Risk">
      <s-link slot="primary-action" href="/app/products?filter=out_of_stock">View all →</s-link>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {products.map((p) => {
          const isOut = p.inventoryStatus === "out_of_stock";
          return (
            <div
              key={p.productId}
              role="button" tabIndex={0}
              onClick={() => navigate("/app/products?filter=out_of_stock")}
              onKeyDown={(e) => e.key === "Enter" && navigate("/app/products?filter=out_of_stock")}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: isOut ? "#fff5f5" : "#fffbeb", border: `1px solid ${isOut ? "#fca5a5" : "#fde68a"}`, borderRadius: 6, padding: "10px 14px", cursor: "pointer" }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{p.productTitle ?? "—"}</div>
                {p.sku && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>SKU: {p.sku}</div>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 18, color: isOut ? "#dc2626" : "#d97706" }}>
                  {p.currentQuantity}
                </span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: isOut ? "#fee2e2" : "#fef3c7", color: isOut ? "#991b1b" : "#92400e", fontWeight: 600, whiteSpace: "nowrap" }}>
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
