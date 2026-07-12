export function ProductsBulkActionBar({ count, busy, onEnable, onDisable, onClear }: {
  count: number;
  busy: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onClear: () => void;
}) {
  return (
    <div style={{ position: "sticky", bottom: 16, zIndex: 50, margin: "12px 0 0", background: "#111827", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}>
      <span style={{ color: "#e5e7eb", fontSize: 14, fontWeight: 500, flex: 1 }}>
        {count} product{count !== 1 ? "s" : ""} selected
      </span>
      <button
        type="button"
        onClick={onEnable}
        disabled={busy}
        style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
      >
        Enable Monitoring
      </button>
      <button
        type="button"
        onClick={onDisable}
        disabled={busy}
        style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
      >
        Disable Monitoring
      </button>
      <button
        type="button"
        onClick={onClear}
        style={{ padding: "7px 12px", borderRadius: 6, border: "1px solid #4b5563", background: "transparent", color: "#9ca3af", cursor: "pointer", fontSize: 13 }}
      >
        Clear
      </button>
    </div>
  );
}
