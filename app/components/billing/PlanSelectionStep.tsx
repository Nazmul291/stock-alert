import type { PlanKey } from "../../lib/billing-plans";
import { BillingPlanCards } from "./BillingPlanCards";
import { BillingFeatureComparisonTable } from "./BillingFeatureComparisonTable";

// Step 3 of the inline wizard on app._index.tsx — same content as
// app.billing._index.tsx (used later for plan switches/upgrades), just
// without the <s-page> chrome since the nav menu is hidden here. Clicking a
// plan still bounces out to Shopify's billing approval screen and back
// through app.billing.confirm.tsx — that hop is inherent to Shopify billing
// and can't be avoided, but viewing the plans themselves needs no navigation.
export function PlanSelectionStep({ activePlan, error }: { activePlan: PlanKey | null; error: string | null }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", padding: "40px 16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#d1fae5", borderRadius: 20, padding: "4px 12px", marginBottom: 16 }}>
            <span style={{ color: "#065f46", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>✦ ALMOST THERE</span>
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 700, color: "#111827" }}>Choose your plan</h1>
          <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>Every plan includes a 30-day free trial — no charge until it ends.</p>
        </div>

        {error && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "12px 16px", marginBottom: 16, color: "#991b1b" }}>
            <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Billing error</p>
            <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{error}</p>
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: 32, marginBottom: 24 }}>
          <BillingPlanCards activePlan={activePlan} />
        </div>

        <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: 32 }}>
          <BillingFeatureComparisonTable />
        </div>
      </div>
    </div>
  );
}
