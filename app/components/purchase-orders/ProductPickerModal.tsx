import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSSEData } from "../../hooks/use-sse-data";
import type { SupplierPreview, ProductPickerRow } from "../../lib/purchase-order.server";
import type { CandidateRow, LineState } from "./CreatePurchaseOrderModal";
import { Thumbnail } from "./Thumbnail";

const MIN_SEARCH_LENGTH = 2;

type ProductGroup = {
  productId: string;
  productTitle: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  variants: CandidateRow[];
};

function groupByProduct(rows: CandidateRow[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const row of rows) {
    let group = map.get(row.productId);
    if (!group) {
      group = { productId: row.productId, productTitle: row.productTitle, imageUrl: row.imageUrl, imageAlt: row.imageAlt, variants: [] };
      map.set(row.productId, group);
    }
    group.variants.push(row);
  }
  return Array.from(map.values());
}

// Standalone popup for browsing/selecting products, opened from the
// "Products" trigger field on the main Create Purchase Order modal. Kept
// separate so the main modal never has to devote most of its height to a
// full product list — the picker only exists (and only fetches data) while
// it's open. Grouped by product with a nested variant list underneath, so
// merchants pick the exact variant they mean to order rather than a bare
// "product" that Shopify itself never lets you order like that.
//
// Selection-only — quantity and unit cost are edited back on the main
// modal's selected-products list, not in here.
export function ProductPickerModal({
  supplierId,
  lines,
  onToggleLine,
  onClose,
}: {
  supplierId: string;
  lines: Record<string, LineState>;
  onToggleLine: (row: CandidateRow) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const isSearching = search.trim().length >= MIN_SEARCH_LENGTH;

  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    if (!isSearching) { setDebouncedSearch(""); return; }
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search, isSearching]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const suggestUrl = `/api/purchase-order-picker-stream?intent=suggested_lines${supplierId ? `&supplierId=${encodeURIComponent(supplierId)}` : ""}`;
  const { data: previewData, error: previewError } = useSSEData<{ preview: SupplierPreview[] }>(suggestUrl);
  const previewLoading = previewData === null && previewError === null;
  const recommended: CandidateRow[] = (previewData?.preview ?? []).flatMap((g) => g.lines);
  const browsing = !isSearching && !previewLoading && recommended.length === 0;

  const productsUrl = isSearching
    ? (debouncedSearch ? `/api/purchase-order-picker-stream?intent=search_products&search=${encodeURIComponent(debouncedSearch)}` : null)
    : (browsing ? "/api/purchase-order-picker-stream?intent=search_products&search=" : null);
  const { data: productsData, error: productsError } = useSSEData<{ products: ProductPickerRow[] }>(productsUrl);
  const productsLoading = productsUrl !== null && productsData === null && productsError === null;

  const searchResults: CandidateRow[] = productsData?.products ?? [];
  const candidates = isSearching || browsing ? searchResults : recommended;
  const groups = groupByProduct(candidates);

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 600, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>Select Products</p>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
              ✕
            </button>
          </div>
          <input
            type="text"
            autoFocus
            placeholder="Search by product name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
          />
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "14px 20px" }}>
          {isSearching && productsError ? (
            <p style={{ fontSize: 13, color: "#991b1b" }}>{productsError}</p>
          ) : isSearching && productsLoading ? (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>Searching…</p>
          ) : isSearching && candidates.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>{`No products match "${search.trim()}".`}</p>
          ) : !isSearching && (previewError || (browsing && productsError)) ? (
            <p style={{ fontSize: 13, color: "#991b1b" }}>{previewError ?? productsError}</p>
          ) : !isSearching && (previewLoading || (browsing && productsLoading)) ? (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>Loading products…</p>
          ) : !isSearching && candidates.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9ca3af" }}>No tracked products yet — search above, or track some from the Products page.</p>
          ) : (
            <>
              {!isSearching && (
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                  {browsing
                    ? "Nothing currently at risk — showing your tracked products."
                    : `Recommended ${supplierId ? "for this supplier" : "across all suppliers"} — based on stock and lead time.`}
                </p>
              )}
              {groups.map((group) => {
                const singleVariant = group.variants.length === 1;
                const soleRow = group.variants[0];
                const soleSelected = singleVariant && !!lines[soleRow.variantId];
                return (
                  <div key={group.productId} style={{ border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
                    <div
                      role={singleVariant ? "button" : undefined}
                      tabIndex={singleVariant ? 0 : undefined}
                      onClick={singleVariant ? () => onToggleLine(soleRow) : undefined}
                      onKeyDown={singleVariant ? (e) => e.key === "Enter" && onToggleLine(soleRow) : undefined}
                      style={{ display: "flex", gap: 10, padding: 10, alignItems: "center", background: soleSelected ? "#eef2ff" : "#fafafa", cursor: singleVariant ? "pointer" : "default" }}
                    >
                      <Thumbnail imageUrl={group.imageUrl} imageAlt={group.imageAlt} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {group.productTitle ?? "—"}
                      </span>
                      {singleVariant && (
                        <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                          {soleRow.sku && <>{soleRow.sku} · </>}{soleRow.currentQuantity} in stock
                          {soleRow.suggestedQuantity > 0 && <span style={{ marginLeft: 6, color: "#4338ca", fontWeight: 600 }}>Suggested {soleRow.suggestedQuantity}</span>}
                        </span>
                      )}
                      {soleSelected && <span style={{ flexShrink: 0, color: "#4f46e5", fontWeight: 700 }}>✓</span>}
                    </div>

                    {!singleVariant && (
                      <div style={{ borderTop: "1px solid #f3f4f6" }}>
                        {group.variants.map((row) => {
                          const selected = !!lines[row.variantId];
                          return (
                            <div key={row.variantId} style={{ padding: "8px 10px 8px 56px", borderBottom: "1px solid #f9fafb", background: selected ? "#eef2ff" : "#fff" }}>
                              <div
                                role="button" tabIndex={0}
                                onClick={() => onToggleLine(row)}
                                onKeyDown={(e) => e.key === "Enter" && onToggleLine(row)}
                                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", gap: 8 }}
                              >
                                <span style={{ fontSize: 12, fontWeight: 500, color: "#374151" }}>{row.variantTitle ?? "—"}</span>
                                <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0, textAlign: "right" }}>
                                  {row.sku && <>{row.sku} · </>}{row.currentQuantity} in stock
                                  {row.suggestedQuantity > 0 && <span style={{ marginLeft: 6, color: "#4338ca", fontWeight: 600 }}>Suggested {row.suggestedQuantity}</span>}
                                  {selected && <span style={{ marginLeft: 6, color: "#4f46e5", fontWeight: 700 }}>✓</span>}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button type="button" onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
