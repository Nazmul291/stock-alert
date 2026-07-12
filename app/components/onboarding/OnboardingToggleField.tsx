export function OnboardingToggleField({ label, name, defaultChecked, helpText }: { label: string; name: string; defaultChecked: boolean; helpText?: string }) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="hidden" name={name} value="false" />
        <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} style={{ width: 16, height: 16 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{label}</span>
      </label>
      {helpText && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2, marginLeft: 24 }}>{helpText}</p>}
    </div>
  );
}
