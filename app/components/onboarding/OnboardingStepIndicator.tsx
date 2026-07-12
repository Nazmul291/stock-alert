const STEP_LABELS = ["App Installed", "Global Settings"];

export function OnboardingStepIndicator({ step }: { step: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 32px", borderBottom: "1px solid #f3f4f6" }}>
      {[1, 2].map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
              background: s < step ? "#008060" : s === step ? "#008060" : "#e1e3e5",
              color: s <= step ? "#fff" : "#8c9196",
            }}>
              {s < step ? "✓" : s}
            </div>
            <span style={{ fontSize: 11, color: s <= step ? "#008060" : "#8c9196", fontWeight: s === step ? 700 : 400, whiteSpace: "nowrap" }}>
              {STEP_LABELS[s - 1]}
            </span>
          </div>
          {i < 1 && (
            <div style={{ width: 80, height: 2, background: s < step ? "#008060" : "#e1e3e5", margin: "0 8px", marginBottom: 18 }} />
          )}
        </div>
      ))}
    </div>
  );
}
