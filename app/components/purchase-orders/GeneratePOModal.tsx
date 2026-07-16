import { useEffect, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { SupplierPreview } from "../../lib/purchase-order.server";

export function GeneratePOModal({ onClose }: { onClose: () => void }) {
  const previewFetcher = useFetcher<{ preview: SupplierPreview[] }>();
  const createFetcher = useFetcher<{ success: boolean; error?: string; purchaseOrderId?: string }>();
  const navigate = useNavigate();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [createdSupplierId, setCreatedSupplierId] = useState<string | null>(null);

  useEffect(() => {
    previewFetcher.load("/app/purchase-orders?intent=preview_generate");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (createFetcher.state !== "idle" || !createFetcher.data) return;
    if (createFetcher.data.success && createFetcher.data.purchaseOrderId) {
      navigate(`/app/purchase-orders/${createFetcher.data.purchaseOrderId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createFetcher.state, createFetcher.data]);

  const preview = previewFetcher.data?.preview ?? [];
  const loading = previewFetcher.state === "loading" && !previewFetcher.data;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>Generate Purchase Orders</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px 24px" }}>
          {createFetcher.data && !createFetcher.data.success && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", marginBottom: 16, color: "#991b1b", fontSize: 13 }}>
              {createFetcher.data.error}
            </div>
          )}

          {loading ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>Loading at-risk products…</p>
          ) : preview.length === 0 ? (
            <p style={{ color: "#6b7280", fontSize: 14 }}>
              No products are currently at risk of stocking out within their supplier&apos;s lead time. Assign suppliers to products from the Products page to get started.
            </p>
          ) : (
            preview.map((supplier) => (
              <div key={supplier.supplierId} style={{ marginBottom: 20, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "#f9fafb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#111827" }}>
                    {supplier.supplierName} <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 12 }}>({supplier.leadTimeDays}-day lead time)</span>
                  </p>
                  <button
                    type="button"
                    disabled={createFetcher.state !== "idle"}
                    onClick={() => {
                      setCreatedSupplierId(supplier.supplierId);
                      const overrides: Record<string, number> = {};
                      for (const line of supplier.lines) {
                        const key = `${supplier.supplierId}:${line.variantId}`;
                        const raw = quantities[key];
                        overrides[line.variantId] = raw != null ? Math.max(0, parseInt(raw) || 0) : line.suggestedQuantity;
                      }
                      createFetcher.submit(
                        { intent: "confirm_generate_po", supplierId: supplier.supplierId, quantityOverrides: JSON.stringify(overrides) },
                        { method: "post" },
                      );
                    }}
                    style={{
                      padding: "6px 14px", borderRadius: 6, border: "none",
                      background: createFetcher.state !== "idle" ? "#9ca3af" : "#111827", color: "#fff",
                      cursor: createFetcher.state !== "idle" ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
                    }}
                  >
                    {createFetcher.state !== "idle" && createdSupplierId === supplier.supplierId ? "Creating…" : "Create Draft PO"}
                  </button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                      {["Product", "SKU", "On Hand", "Days Left", "Suggested Qty"].map((label) => (
                        <th key={label} style={{ textAlign: "left", padding: "6px 14px", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {supplier.lines.map((line) => {
                      const key = `${supplier.supplierId}:${line.variantId}`;
                      return (
                        <tr key={line.variantId} style={{ borderBottom: "1px solid #f9fafb" }}>
                          <td style={{ padding: "6px 14px" }}>{line.productTitle ?? "—"}{line.variantTitle ? ` — ${line.variantTitle}` : ""}</td>
                          <td style={{ padding: "6px 14px", color: "#6b7280" }}>{line.sku ?? "—"}</td>
                          <td style={{ padding: "6px 14px" }}>{line.currentQuantity}</td>
                          <td style={{ padding: "6px 14px" }}>{line.stockOutDays ?? "—"}</td>
                          <td style={{ padding: "6px 14px" }}>
                            <input
                              type="number" min={0}
                              value={quantities[key] ?? String(line.suggestedQuantity)}
                              onChange={(e) => setQuantities((prev) => ({ ...prev, [key]: e.target.value }))}
                              style={{ width: 70, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
