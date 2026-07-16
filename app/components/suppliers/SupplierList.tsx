import { useFetcher } from "react-router";

export type SupplierRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadTimeDays: number | null;
  notes: string | null;
  productCount: number;
};

export function SupplierList({ suppliers, onEdit }: { suppliers: SupplierRow[]; onEdit: (s: SupplierRow) => void }) {
  const deleteFetcher = useFetcher<{ success: boolean; error?: string }>();

  if (suppliers.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
        <p style={{ fontSize: 16, marginBottom: 4 }}>No suppliers yet.</p>
        <p style={{ fontSize: 14 }}>Add a supplier, then assign products to it from the Products page.</p>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      {deleteFetcher.data && !deleteFetcher.data.success && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 12, color: "#991b1b", fontSize: 13 }}>
          {deleteFetcher.data.error}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            {["Name", "Email", "Phone", "Lead time", "Products", "Actions"].map((label) => (
              <th key={label} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "10px 12px", fontWeight: 500 }}>{s.name}</td>
              <td style={{ padding: "10px 12px", color: "#374151" }}>{s.email ?? "—"}</td>
              <td style={{ padding: "10px 12px", color: "#374151" }}>{s.phone ?? "—"}</td>
              <td style={{ padding: "10px 12px", color: "#374151" }}>
                {s.leadTimeDays != null ? `${s.leadTimeDays} days` : "Store default"}
              </td>
              <td style={{ padding: "10px 12px", color: "#374151" }}>{s.productCount}</td>
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => onEdit(s)}
                    style={{ background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: "#374151", fontSize: 13 }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm(`Delete supplier "${s.name}"?`)) return;
                      deleteFetcher.submit({ intent: "delete_supplier", id: s.id }, { method: "post" });
                    }}
                    disabled={deleteFetcher.state !== "idle"}
                    style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 6, padding: "5px 10px", cursor: deleteFetcher.state !== "idle" ? "not-allowed" : "pointer", color: "#991b1b", fontSize: 13 }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
