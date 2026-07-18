import type { ReactNode } from "react";

export function OnboardingPrimaryButton({ children, loading, disabled }: { children: ReactNode; loading: boolean; disabled?: boolean }) {
  const inactive = loading || disabled;
  return (
    <button type="submit" disabled={inactive} style={{
      width: "100%", padding: "12px 20px", borderRadius: 8, border: "none",
      background: inactive ? "#b5b5b5" : "#008060", color: "#fff",
      fontSize: 15, fontWeight: 600, cursor: inactive ? "not-allowed" : "pointer",
    }}>
      {loading ? "Loading…" : children}
    </button>
  );
}
