import { Fragment } from "react";
import type { ProductRow } from "./ProductEditModal";
import { StockOutBadge } from "./StockOutBadge";
import { ReorderBadge } from "./ReorderBadge";
import { useProductsStore } from "../../stores/products-store";

export const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  in_stock: { bg: "#d1fae5", color: "#065f46", label: "In Stock" },
  low_stock: { bg: "#fef3c7", color: "#92400e", label: "Low Stock" },
  out_of_stock: { bg: "#fee2e2", color: "#991b1b", label: "Out of Stock" },
  deactivated: { bg: "#f3f4f6", color: "#374151", label: "Deactivated" },
  requires_upgrade: { bg: "#e0e7ff", color: "#4338ca", label: "Requires Pro" },
  not_tracked: { bg: "#ede9fe", color: "#5b21b6", label: "Not Tracked" },
};

export function ProductsTable({
  selectedIds,
  toggleSelect,
  allSelected,
  toggleSelectAll,
  selectableIds,
  expandedProductIds,
  toggleExpandProduct,
  onEditProduct,
}: {
  selectedIds: Set<string>;
  toggleSelect: (productId: string) => void;
  allSelected: boolean;
  toggleSelectAll: () => void;
  selectableIds: string[];
  expandedProductIds: Set<string>;
  toggleExpandProduct: (productId: string) => void;
  onEditProduct: (product: ProductRow) => void;
}) {
  const products = useProductsStore((s) => s.data!.products);
  const filter = useProductsStore((s) => s.filter);
  const supplierLeadTimeDays = useProductsStore((s) => s.data!.supplierLeadTimeDays);

  if (products.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
        <p style={{ fontSize: 16, marginBottom: 8 }}>No products found.</p>
        <p style={{ fontSize: 14 }}>
          {filter === "not_tracked"
            ? "All products have been synced and are tracked."
            : "Click Sync Products to import your Shopify inventory."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            <th style={{ padding: "8px 8px 8px 12px", width: 32 }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                disabled={selectableIds.length === 0}
                aria-label="Select all"
                style={{ cursor: selectableIds.length === 0 ? "not-allowed" : "pointer" }}
              />
            </th>
            {[
              { label: "Product" },
              { label: "SKU" },
              { label: "Quantity" },
              { label: "Status", width: 130 },
              { label: "Days Left" },
              { label: "Reorder By" },
              { label: "Monitor Alert" },
              { label: "Action" },
            ].map(({ label, width }) => (
              <th key={label} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap", ...(width ? { width, minWidth: width } : {}) }}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {products.map((p: ProductRow) => {
            const s = STATUS_STYLE[p.inventoryStatus ?? "not_tracked"] ?? STATUS_STYLE.not_tracked;
            const isNotTracked = p.inventoryStatus === "not_tracked";
            const hasVariants = (p.variantCount ?? 0) > 1;
            const isExpanded = expandedProductIds.has(p.productId);
            const mixedVariants = hasVariants && (p.variantsAtRiskCount ?? 0) > 0 && (p.variantsAtRiskCount ?? 0) < (p.variantCount ?? 0);
            return (
              <Fragment key={p.id}>
              <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #f3f4f6", opacity: isNotTracked ? 0.8 : 1 }}>
                <td style={{ padding: "10px 8px 10px 12px", width: 32 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.productId)}
                    onChange={() => toggleSelect(p.productId)}
                    disabled={!p.isTracked}
                    aria-label={`Select ${p.productTitle}`}
                    style={{ cursor: p.isTracked ? "pointer" : "not-allowed" }}
                  />
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {hasVariants ? (
                      <button
                        type="button"
                        onClick={() => toggleExpandProduct(p.productId)}
                        aria-label={isExpanded ? "Collapse variants" : "Expand variants"}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "#6b7280", flexShrink: 0, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform .15s" }}
                      >
                        ▸
                      </button>
                    ) : (
                      <span style={{ width: 18, flexShrink: 0 }} />
                    )}
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt={p.imageAlt} width={40} height={40} loading="lazy"
                        style={{ borderRadius: 6, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 18 }}>
                        ▢
                      </div>
                    )}
                    <span style={{ fontWeight: 500 }}>{p.productTitle ?? "—"}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 12px", color: "#6b7280" }}>{hasVariants ? `${p.variantCount} variants` : (p.sku ?? "—")}</td>
                <td style={{ padding: "10px 12px", fontWeight: 600, color: isNotTracked ? "#9ca3af" : p.inventoryStatus === "out_of_stock" ? "#dc2626" : p.inventoryStatus === "low_stock" ? "#d97706" : "#059669" }}>
                  {isNotTracked ? "—" : p.currentQuantity}
                </td>
                <td style={{ padding: "10px 12px", width: 130, minWidth: 130 }}>
                  {mixedVariants ? (
                    <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                      {p.variantsAtRiskCount} of {p.variantCount} low
                    </span>
                  ) : (
                    <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" }}>
                      {s.label}
                    </span>
                  )}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <StockOutBadge days={p.isTracked ? (p.stockOutDays ?? null) : null} isManual={!!p.manualDailySales} />
                  {p.expectedRestockDate && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                      Back: {new Date(p.expectedRestockDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  )}
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <ReorderBadge days={p.isTracked ? (p.stockOutDays ?? null) : null} leadTime={supplierLeadTimeDays ?? 7} />
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{
                    background: p.monitoringEnabled ? "#d1fae5" : p.inventoryStatus === "requires_upgrade" ? "#e0e7ff" : "#f3f4f6",
                    color: p.monitoringEnabled ? "#065f46" : p.inventoryStatus === "requires_upgrade" ? "#4338ca" : "#6b7280",
                    padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 500,
                  }}>
                    {p.monitoringEnabled ? "Active" : p.inventoryStatus === "requires_upgrade" ? "Requires Pro" : "Disabled"}
                  </span>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <button
                    onClick={() => onEditProduct(p)}
                    disabled={p.inventoryStatus === "requires_upgrade"}
                    title={p.inventoryStatus === "requires_upgrade" ? "Upgrade to Pro to edit this product" : "Edit product"}
                    style={{
                      background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 8px",
                      cursor: p.inventoryStatus === "requires_upgrade" ? "not-allowed" : "pointer",
                      color: p.inventoryStatus === "requires_upgrade" ? "#9ca3af" : "#374151",
                      opacity: p.inventoryStatus === "requires_upgrade" ? 0.6 : 1,
                      display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit
                  </button>
                </td>
              </tr>
              {isExpanded && hasVariants && (
                <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
                  <td />
                  <td colSpan={7} style={{ padding: "4px 12px 12px 40px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(p.variants ?? []).map((v) => {
                        const vs = STATUS_STYLE[v.inventoryStatus] ?? STATUS_STYLE.not_tracked;
                        return (
                          <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "#fff", borderRadius: 6, border: "1px solid #f0f0f0" }}>
                            <span style={{ flex: 1, fontSize: 13, color: "#374151" }}>{v.variantTitle ?? "—"}</span>
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>{v.sku ?? "—"}</span>
                            <span style={{ fontWeight: 600, fontSize: 13, width: 50, textAlign: "right", color: v.inventoryStatus === "out_of_stock" ? "#dc2626" : v.inventoryStatus === "low_stock" ? "#d97706" : "#059669" }}>
                              {v.currentQuantity}
                            </span>
                            <span style={{ background: vs.bg, color: vs.color, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", width: 90, textAlign: "center" }}>
                              {vs.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
