export function UnsavedChangesBar({ saving, onDiscard, onSave }: {
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0,
      background: "#fff", borderBottom: "1px solid #e5e7eb",
      padding: "12px 24px",
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
      zIndex: 1000, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    }}>
      <span style={{ fontSize: 14, color: "#6b7280" }}>You have unsaved changes</span>
      <div style={{ display: "flex", gap: 10 }}>
        <button
          type="button"
          onClick={onDiscard}
          style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save Integrations"}
        </button>
      </div>
    </div>
  );
}
