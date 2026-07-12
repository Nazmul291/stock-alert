import type { ReactNode } from "react";

export function OnboardingPrimaryButton({ children, loading }: { children: ReactNode; loading: boolean }) {
  return (
    <button type="submit" disabled={loading} style={{
      width: "100%", padding: "12px 20px", borderRadius: 8, border: "none",
      background: loading ? "#b5b5b5" : "#008060", color: "#fff",
      fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
    }}>
      {loading ? "Loading…" : children}
    </button>
  );
}
