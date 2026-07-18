import { PLAN_LIMITS, formatMaxProducts } from "../../lib/plan-limits";

// Restriction-backed rows are generated from PLAN_LIMITS itself (single
// source of truth shared with every server-side canUseFeature() gate) so
// this table can't drift from what's actually enforced for Basic/Pro.
// Every row here is built and enforced via canUseFeature() — Suppliers +
// purchase orders (purchaseOrders) in app.suppliers.tsx / app.purchase-orders*.tsx,
// coreLimitedEditionSections/deadStockAlerts in app.analytics.tsx / app.settings.tsx.
const RESTRICTION_ROWS: { key: keyof typeof PLAN_LIMITS.basic.restrictions; label: string; comingSoon?: boolean }[] = [
  { key: "slackNotifications", label: "One-click Slack Connect" },
  { key: "asanaTaskCreation", label: "Asana task creation" },
  { key: "klaviyoIntegration", label: "Klaviyo integration" },
  { key: "outboundWebhook", label: "Outbound webhook (Zapier/Make/ERP)" },
  { key: "perProductThresholds", label: "Per-product thresholds" },
  { key: "autoRepublish", label: "Auto-republish when restocked" },
  { key: "multipleRecipients", label: "Multiple notification recipients" },
  { key: "whiteLabelEmails", label: "White-label branded emails" },
  { key: "prioritySupport", label: "Priority support" },
  { key: "coreLimitedEditionSections", label: "Core vs. Limited-Edition report sections" },
  { key: "deadStockAlerts", label: "Dead stock alerts" },
  { key: "purchaseOrders", label: "Suppliers & purchase order generation" },
  { key: "vendorLeadTimeReorderPoints", label: "Reorder points by vendor lead time" },
];

// Full side-by-side breakdown shown below the plan cards — includes rows
// (like product limits) that were trimmed from the per-card bullet lists
// above to keep those short and scannable.
const FEATURE_COMPARISON: { label: string; basic: string | boolean; pro: string | boolean; enterprise: string | boolean; comingSoon?: boolean }[] = [
  {
    label: "Products tracked",
    basic: formatMaxProducts(PLAN_LIMITS.basic.maxProducts),
    pro: formatMaxProducts(PLAN_LIMITS.pro.maxProducts),
    enterprise: formatMaxProducts(PLAN_LIMITS.enterprise.maxProducts),
  },
  { label: "Email notifications", basic: true, pro: true, enterprise: true },
  { label: "Auto-hide sold-out products", basic: true, pro: true, enterprise: true },
  { label: "Shopify Flow triggers", basic: true, pro: true, enterprise: true },
  { label: "Back-in-stock storefront widget", basic: true, pro: true, enterprise: true },
  { label: "Global threshold settings", basic: true, pro: true, enterprise: true },
  ...RESTRICTION_ROWS.map(({ key, label, comingSoon }) => ({
    label,
    basic: PLAN_LIMITS.basic.restrictions[key],
    pro: PLAN_LIMITS.pro.restrictions[key],
    enterprise: PLAN_LIMITS.enterprise.restrictions[key],
    comingSoon,
  })),
];

function ComparisonCell({ value, comingSoon }: { value: string | boolean; comingSoon?: boolean }) {
  if (typeof value === "string") return <>{value}</>;
  if (!value) return <span style={{ color: "#d1d5db" }}>—</span>;
  if (comingSoon) return <span style={{ color: "#4338ca", fontSize: 12, fontWeight: 600 }}>Coming Soon</span>;
  return <>✓</>;
}

export function BillingFeatureComparisonTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Feature</th>
            <th style={{ textAlign: "center", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#374151", fontWeight: 700 }}>Basic</th>
            <th style={{ textAlign: "center", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#059669", fontWeight: 700 }}>Professional</th>
            <th style={{ textAlign: "center", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#4338ca", fontWeight: 700 }}>
              Enterprise
            </th>
          </tr>
        </thead>
        <tbody>
          {FEATURE_COMPARISON.map((row) => (
            <tr key={row.label} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "10px 12px", color: "#111827" }}>{row.label}</td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                <ComparisonCell value={row.basic} />
              </td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                <ComparisonCell value={row.pro} />
              </td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                <ComparisonCell value={row.enterprise} comingSoon={row.comingSoon} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
