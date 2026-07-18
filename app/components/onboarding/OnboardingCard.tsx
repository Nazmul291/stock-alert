import type { ReactNode } from "react";

// Shared shell for the inline wizard steps rendered directly on app._index.tsx
// (terms acceptance, confirm-install, settings) — the nav menu is hidden for
// as long as one of these is showing (see app.tsx's hideNav), so this is
// meant to stand alone as a full page, not live inside <s-page>.
export function OnboardingCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        <div style={{ background: "#008060", padding: "28px 32px 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px", marginBottom: 16 }}>
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>✦ STOCK ALERT SETUP</span>
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#fff" }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{subtitle}</p>
        </div>

        <div style={{ padding: "32px" }}>{children}</div>
      </div>
    </div>
  );
}
