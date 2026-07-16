import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { SupplierRow } from "./SupplierList";

type SaveResult = { success: true; intent: string } | { success: false; error: string };

export function SupplierFormModal({ supplier, onClose }: { supplier: SupplierRow | null; onClose: () => void }) {
  const fetcher = useFetcher<SaveResult>();
  const [name, setName] = useState(supplier?.name ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [leadTimeDays, setLeadTimeDays] = useState(supplier?.leadTimeDays != null ? String(supplier.leadTimeDays) : "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");

  const closedRef = useRef(false);
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || closedRef.current) return;
    if (fetcher.data.success) {
      closedRef.current = true;
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  const saving = fetcher.state === "submitting";
  const isEdit = !!supplier;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>{isEdit ? "Edit Supplier" : "Add Supplier"}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {fetcher.data && !fetcher.data.success && (
            <div style={{ margin: "12px 24px 0", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", color: "#991b1b", fontSize: 13 }}>
              {fetcher.data.error}
            </div>
          )}

          <fetcher.Form method="post" style={{ padding: "20px 24px 24px" }}>
            <input type="hidden" name="intent" value={isEdit ? "update_supplier" : "create_supplier"} />
            {isEdit && <input type="hidden" name="id" value={supplier!.id} />}

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Name *</label>
              <input
                type="text" name="name" required value={name} onChange={(e) => setName(e.target.value)}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Email</label>
              <input
                type="email" name="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="orders@supplier.com"
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>Purchase orders are sent here.</p>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Phone</label>
              <input
                type="tel" name="phone" value={phone} onChange={(e) => setPhone(e.target.value)}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Lead time (days)</label>
              <input
                type="number" name="leadTimeDays" min={1} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)}
                placeholder="Store default"
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" }}
              />
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
                How long this supplier takes to fulfill an order. Leave blank to use your store&apos;s default lead time.
              </p>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Notes</label>
              <textarea
                name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box", resize: "vertical" }}
              />
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} disabled={saving}
                style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: saving ? "#9ca3af" : "#111827", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Supplier"}
              </button>
            </div>
          </fetcher.Form>
        </div>
      </div>
    </div>
  );
}
