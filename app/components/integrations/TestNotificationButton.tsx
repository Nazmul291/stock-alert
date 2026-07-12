export function TestNotificationButton({ testing, disabled, disabledReason, isDirty, onTest }: {
  testing: boolean;
  disabled: boolean;
  disabledReason?: string;
  isDirty: boolean;
  onTest: () => void;
}) {
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <button
        type="button"
        disabled={testing || disabled}
        onClick={onTest}
        title={disabledReason}
        style={{
          padding: "8px 18px",
          borderRadius: 8,
          border: "1.5px solid #d1d5db",
          background: "#fff",
          color: disabled ? "#9ca3af" : "#374151",
          cursor: testing || disabled ? "not-allowed" : "pointer",
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {testing ? "Sending…" : "Send Test Notification"}
      </button>
      {isDirty && <span style={{ fontSize: 12, color: "#9ca3af" }}>Save first to test.</span>}
    </div>
  );
}
