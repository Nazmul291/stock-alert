export function BillingConfirmStatus({ status, message, onChoosePlan, onRetry }: {
  status: "loading" | "success" | "declined" | "error";
  message?: string;
  onChoosePlan: () => void;
  onRetry: () => void;
}) {
  return (
    <div style={{ textAlign: "center", padding: 40, maxWidth: 420 }}>
      {status === "loading" && (
        <>
          <div style={{
            width: 56, height: 56, border: "4px solid #e1e3e5", borderTopColor: "#008060",
            borderRadius: "50%", margin: "0 auto 20px",
            animation: "spin 0.8s linear infinite",
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 6px" }}>Confirming your subscription…</p>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Please wait a moment.</p>
        </>
      )}

      {status === "success" && (
        <>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "#008060",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", fontSize: 28, color: "#fff",
          }}>
            ✓
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>You're all set!</p>
          <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Redirecting you to the dashboard…</p>
        </>
      )}

      {(status === "declined" || status === "error") && (
        <>
          <div style={{
            width: 56, height: 56, borderRadius: "50%", background: "#fee2e2",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px", fontSize: 28, color: "#dc2626",
          }}>
            ✕
          </div>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
            {status === "declined" ? "Payment not confirmed" : "Something went wrong"}
          </p>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 6px" }}>
            {message ?? "We couldn't verify your subscription."}
          </p>
          {status === "error" && (
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 20px", fontFamily: "monospace", background: "#f3f4f6", padding: "8px 12px", borderRadius: 6, textAlign: "left" }}>
              {message}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
            <button onClick={onChoosePlan}
              style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#008060", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
              Choose a plan
            </button>
            {status === "error" && (
              <button onClick={onRetry}
                style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                Retry check
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
