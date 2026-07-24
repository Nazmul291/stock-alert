import type { ProductRow } from "./ProductEditModal";
import { STATUS_STYLE } from "./ProductsTable";
import { SalesVelocityBadge } from "./SalesVelocityBadge";
import { StockOutBadge } from "./StockOutBadge";

export function ProductDetailHeader({ product }: { product: ProductRow }) {
  const s = STATUS_STYLE[product.inventoryStatus ?? "not_tracked"] ?? STATUS_STYLE.not_tracked;
  const variants = product.variants ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.imageAlt} width={64} height={64} loading="lazy"
            style={{ borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }} />
        ) : (
          <div style={{ width: 64, height: 64, borderRadius: 8, background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 26 }}>
            ▢
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: "#111827" }}>{product.productTitle}</p>
          {product.sku && <p style={{ margin: "2px 0 0", fontSize: 13, color: "#9ca3af" }}>SKU: {product.sku}</p>}
        </div>
        <span style={{ background: s.bg, color: s.color, padding: "4px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
          {s.label}
        </span>
      </div>

      {variants.length > 1 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                {["Variant", "SKU", "Quantity", "Status"].map((label) => (
                  <th key={label} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => {
                const vs = STATUS_STYLE[v.inventoryStatus ?? "not_tracked"] ?? STATUS_STYLE.not_tracked;
                return (
                  <tr key={v.id} style={{ borderBottom: "1px solid #f9fafb" }}>
                    <td style={{ padding: "6px 8px" }}>{v.variantTitle ?? "Default"}</td>
                    <td style={{ padding: "6px 8px", color: "#6b7280" }}>{v.sku ?? "—"}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{v.currentQuantity}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ background: vs.bg, color: vs.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                        {vs.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Quantity</p>
            <p style={{ margin: "2px 0 0", fontWeight: 600, fontSize: 15 }}>{product.currentQuantity}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Sales Velocity</p>
            <SalesVelocityBadge unitsPerDay={product.avgDailySales ?? null} isManual={!!product.manualDailySales} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Days Left</p>
            <StockOutBadge days={product.stockOutDays ?? null} isManual={!!product.manualDailySales} />
          </div>
        </div>
      )}
    </div>
  );
}
