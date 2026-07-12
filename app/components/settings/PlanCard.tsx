import { canUseFeature, getMaxProducts, formatMaxProducts } from "../../lib/plan-limits";

export function PlanCard({ plan }: { plan: string }) {
  const isPro = plan === "pro";
  const maxProducts = getMaxProducts(plan);
  const productsLabel = Number.isFinite(maxProducts) ? `Up to ${formatMaxProducts(maxProducts)} products` : "Unlimited products";
  const features: { label: string; active: boolean }[] = [
    { label: "Email alerts",                   active: true },
    { label: "Inventory monitoring",            active: true },
    { label: "Auto-hide out-of-stock",          active: true },
    { label: "Shopify Flow triggers",           active: true },
    { label: productsLabel, active: true },
    { label: "Slack Connect",                   active: canUseFeature(plan, "slackNotifications") },
    { label: "Klaviyo integration",             active: canUseFeature(plan, "klaviyoIntegration") },
    { label: "Multiple email recipients",       active: canUseFeature(plan, "multipleRecipients") },
    { label: "Auto-republish on restock",       active: canUseFeature(plan, "autoRepublish") },
    { label: "Per-product thresholds",          active: canUseFeature(plan, "perProductThresholds") },
    { label: "Outbound webhook / Zapier",       active: canUseFeature(plan, "outboundWebhook") },
    { label: "Email branding",                  active: canUseFeature(plan, "whiteLabelEmails") },
  ];

  return (
    <div style={{ marginBottom: 24, padding: "16px 20px", background: isPro ? "#fafafe" : "#f9fafb", border: `1px solid ${isPro ? "#c7d2fe" : "#e5e7eb"}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Current Plan</span>
          <span style={{
            padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: isPro ? "#4f46e5" : "#6b7280", color: "#fff",
          }}>
            {isPro ? "Professional" : "Basic"}
          </span>
        </div>
        {!isPro && <s-link href="/app/billing">Upgrade to Pro →</s-link>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "6px 12px" }}>
        {features.map((f) => {
          const active = f.active;
          return (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: active ? "#374151" : "#9ca3af" }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{active ? "✓" : "🔒"}</span>
              {f.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
