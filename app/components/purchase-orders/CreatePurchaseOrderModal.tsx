import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";
import type { SupplierPreview, ProductPickerRow } from "../../lib/purchase-order.server";

const NEW_SUPPLIER = "__new__";
const MIN_SEARCH_LENGTH = 2;

type LineState = { productTitle: string | null; variantTitle: string | null; sku: string | null; quantityOrdered: string; unitCost: string };

type SupplierOption = { id: string; name: string };

type CreateSupplierResult = { success: boolean; error?: string; id?: string; name?: string };
type CreatePOResult = { success: boolean; error?: string; purchaseOrderId?: string };

export function CreatePurchaseOrderModal({ suppliers, onClose }: { suppliers: SupplierOption[]; onClose: () => void }) {
  const navigate = useNavigate();
  const [supplierList, setSupplierList] = useState(suppliers);
  const [supplierId, setSupplierId] = useState("");
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierEmail, setNewSupplierEmail] = useState("");
  const [newSupplierLeadTime, setNewSupplierLeadTime] = useState("");
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const supplierFetcher = useFetcher<CreateSupplierResult>();
  const suggestFetcher = useFetcher<{ preview: SupplierPreview[] }>();
  const searchFetcher = useFetcher<{ products: ProductPickerRow[] }>();
  const createFetcher = useFetcher<CreatePOResult>();

  function loadSuggestions(id: string) {
    suggestFetcher.load(`/app/purchase-orders?intent=suggested_lines&supplierId=${encodeURIComponent(id)}`);
  }

  function handleSupplierChange(value: string) {
    if (value === NEW_SUPPLIER) {
      setShowNewSupplierForm(true);
      return;
    }
    setSupplierId(value);
    setShowNewSupplierForm(false);
    if (value) loadSuggestions(value);
  }

  function createNewSupplier() {
    if (!newSupplierName.trim()) return;
    supplierFetcher.submit(
      { intent: "create_supplier", name: newSupplierName, email: newSupplierEmail, leadTimeDays: newSupplierLeadTime },
      { method: "post" },
    );
  }

  useEffect(() => {
    if (supplierFetcher.state !== "idle" || !supplierFetcher.data) return;
    if (supplierFetcher.data.success && supplierFetcher.data.id && supplierFetcher.data.name) {
      const newSupplier = { id: supplierFetcher.data.id, name: supplierFetcher.data.name };
      setSupplierList((prev) => [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(newSupplier.id);
      setShowNewSupplierForm(false);
      setNewSupplierName("");
      setNewSupplierEmail("");
      setNewSupplierLeadTime("");
      loadSuggestions(newSupplier.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierFetcher.state, supplierFetcher.data]);

  // Suggestions replace the line-item list wholesale when the supplier
  // changes (they're a starting point, not merged with whatever was there
  // for a different supplier) — quantity/cost stay fully editable/removable.
  useEffect(() => {
    const preview = suggestFetcher.data?.preview?.[0];
    const next: Record<string, LineState> = {};
    for (const line of preview?.lines ?? []) {
      next[line.variantId] = {
        productTitle: line.productTitle,
        variantTitle: line.variantTitle,
        sku: line.sku,
        quantityOrdered: String(Math.max(line.suggestedQuantity, 0)),
        unitCost: line.unitCost != null ? String(line.unitCost) : "",
      };
    }
    setLines(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestFetcher.data]);

  useEffect(() => {
    if (createFetcher.state === "idle" && createFetcher.data?.success && createFetcher.data.purchaseOrderId) {
      navigate(`/app/purchase-orders/${createFetcher.data.purchaseOrderId}`);
    }
  }, [createFetcher.state, createFetcher.data, navigate]);

  // Live search-as-you-type (debounced), once a supplier is selected and the
  // merchant has typed at least MIN_SEARCH_LENGTH characters. Below that,
  // no request fires at all — on a catalog with thousands of products,
  // dumping an arbitrary alphabetical page on focus isn't a useful starting
  // point and just adds load for no benefit; the hint text below guides the
  // merchant to type instead.
  useEffect(() => {
    if (!supplierId || search.trim().length < MIN_SEARCH_LENGTH) return;
    const handle = setTimeout(() => {
      searchFetcher.load(`/app/purchase-orders?intent=search_products&search=${encodeURIComponent(search.trim())}`);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, supplierId]);

  // Delayed so a click on a result row (which blurs the input) still
  // registers before the dropdown unmounts.
  function handleSearchBlur() {
    setTimeout(() => setShowResults(false), 150);
  }

  function addLine(row: ProductPickerRow) {
    setLines((prev) => ({
      ...prev,
      [row.variantId]: {
        productTitle: row.productTitle,
        variantTitle: row.variantTitle,
        sku: row.sku,
        quantityOrdered: String(prev[row.variantId] ? parseInt(prev[row.variantId].quantityOrdered) || 0 : Math.max(row.suggestedQuantity, 1)),
        unitCost: row.unitCost != null ? String(row.unitCost) : "",
      },
    }));
    setSearch("");
    setShowResults(false);
    searchInputRef.current?.focus();
  }

  function removeLine(variantId: string) {
    setLines((prev) => {
      const next = { ...prev };
      delete next[variantId];
      return next;
    });
  }

  function updateLine(variantId: string, patch: Partial<LineState>) {
    setLines((prev) => ({ ...prev, [variantId]: { ...prev[variantId], ...patch } }));
  }

  const lineEntries = Object.entries(lines);
  const hasValidLine = lineEntries.some(([, l]) => (parseInt(l.quantityOrdered) || 0) > 0);
  const creating = createFetcher.state !== "idle";
  const canSubmit = !!supplierId && hasValidLine && !creating;
  const availableResults = (searchFetcher.data?.products ?? []).filter((row) => !lines[row.variantId]);

  function handleCreate() {
    const submitLines = lineEntries
      .map(([variantId, l]) => ({
        variantId,
        quantityOrdered: parseInt(l.quantityOrdered) || 0,
        unitCost: l.unitCost.trim() !== "" && !isNaN(parseFloat(l.unitCost)) ? parseFloat(l.unitCost) : null,
      }))
      .filter((l) => l.quantityOrdered > 0);
    createFetcher.submit({ intent: "create_po", supplierId, lines: JSON.stringify(submitLines) }, { method: "post" });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>Create Purchase Order</p>
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

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Supplier</label>
            <select
              value={showNewSupplierForm ? NEW_SUPPLIER : supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
              style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 }}
            >
              <option value="">Select a supplier…</option>
              {supplierList.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value={NEW_SUPPLIER}>+ New Supplier…</option>
            </select>

            {showNewSupplierForm && (
              <div style={{ marginTop: 10, padding: 12, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                {supplierFetcher.data && !supplierFetcher.data.success && (
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#991b1b" }}>{supplierFetcher.data.error}</p>
                )}
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <input
                    type="text" placeholder="Supplier name *" value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)}
                    style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                  />
                  <input
                    type="email" placeholder="Email (optional)" value={newSupplierEmail} onChange={(e) => setNewSupplierEmail(e.target.value)}
                    style={{ flex: "1 1 160px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                  />
                  <input
                    type="number" min={1} placeholder="Lead time (days)" value={newSupplierLeadTime} onChange={(e) => setNewSupplierLeadTime(e.target.value)}
                    style={{ flex: "1 1 120px", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
                  />
                </div>
                <button
                  type="button" onClick={createNewSupplier} disabled={!newSupplierName.trim() || supplierFetcher.state !== "idle"}
                  style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: !newSupplierName.trim() ? "not-allowed" : "pointer" }}
                >
                  {supplierFetcher.state !== "idle" ? "Creating…" : "Create Supplier"}
                </button>
              </div>
            )}
          </div>

          {supplierId && (
            <>
              <div style={{ marginBottom: 16, position: "relative" }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Add products</label>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search by product name or SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setShowResults(true)}
                  onBlur={handleSearchBlur}
                  style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 10px", fontSize: 13, boxSizing: "border-box" }}
                />
                {showResults && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 10,
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
                    maxHeight: 220, overflowY: "auto",
                  }}>
                    {search.trim().length < MIN_SEARCH_LENGTH ? (
                      <p style={{ margin: 0, padding: "10px 12px", fontSize: 13, color: "#9ca3af" }}>
                        Type at least {MIN_SEARCH_LENGTH} characters to search your products.
                      </p>
                    ) : searchFetcher.state === "loading" ? (
                      <p style={{ margin: 0, padding: "10px 12px", fontSize: 13, color: "#9ca3af" }}>Searching…</p>
                    ) : availableResults.length === 0 ? (
                      <p style={{ margin: 0, padding: "10px 12px", fontSize: 13, color: "#9ca3af" }}>
                        {`No products match "${search.trim()}".`}
                      </p>
                    ) : (
                      availableResults.map((row) => (
                        <button
                          key={row.variantId}
                          type="button"
                          onClick={() => addLine(row)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%",
                            textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #f3f4f6",
                            background: "none", cursor: "pointer", fontSize: 13, color: "#111827",
                          }}
                        >
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {row.productTitle ?? "—"}{row.variantTitle ? ` — ${row.variantTitle}` : ""}
                            {row.sku && <span style={{ color: "#9ca3af" }}> · {row.sku}</span>}
                          </span>
                          <span style={{ flexShrink: 0, fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                            {row.currentQuantity} in stock
                            {row.suggestedQuantity > 0 && <span style={{ marginLeft: 6, color: "#4338ca", fontWeight: 600 }}>Suggested {row.suggestedQuantity}</span>}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              <div>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 6 }}>
                  Line items {suggestFetcher.state === "loading" && "(loading suggestions…)"}
                </p>
                {lineEntries.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#9ca3af" }}>No line items yet — search above to add products.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                        {["Product", "SKU", "Qty", "Unit Cost", ""].map((label) => (
                          <th key={label} style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: "#6b7280", fontSize: 12 }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lineEntries.map(([variantId, l]) => (
                        <tr key={variantId} style={{ borderBottom: "1px solid #f9fafb" }}>
                          <td style={{ padding: "6px 8px" }}>{l.productTitle ?? "—"}{l.variantTitle ? ` — ${l.variantTitle}` : ""}</td>
                          <td style={{ padding: "6px 8px", color: "#6b7280" }}>{l.sku ?? "—"}</td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="number" min={0} value={l.quantityOrdered}
                              onChange={(e) => updateLine(variantId, { quantityOrdered: e.target.value })}
                              style={{ width: 64, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <input
                              type="number" min={0} step={0.01} value={l.unitCost}
                              onChange={(e) => updateLine(variantId, { unitCost: e.target.value })}
                              style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "3px 8px", fontSize: 13 }}
                            />
                          </td>
                          <td style={{ padding: "6px 8px" }}>
                            <button type="button" onClick={() => removeLine(variantId)} style={{ background: "none", border: "none", color: "#991b1b", cursor: "pointer", fontSize: 14 }}>
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: "1px solid #f3f4f6", display: "flex", justifyContent: "flex-end", gap: 10, flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={creating}
            style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
            Cancel
          </button>
          <button type="button" onClick={handleCreate} disabled={!canSubmit}
            style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: canSubmit ? "#111827" : "#9ca3af", color: "#fff", cursor: canSubmit ? "pointer" : "not-allowed", fontSize: 14, fontWeight: 600 }}>
            {creating ? "Creating…" : "Create Purchase Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
