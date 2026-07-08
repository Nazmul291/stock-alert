import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import { getIsTestStore } from "../services/billing.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { PLAN_LIMITS, formatMaxProducts } from "../lib/plan-limits";

// session.plan is kept in sync by the app_subscriptions/update webhook handler
// and by the billing confirm action — no Shopify billing API call needed here.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const dbSession = await getCachedSession(session.shop);
  return { activePlan: (dbSession?.plan ?? null) as "basic" | "pro" | null };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const isTest = await getIsTestStore(admin, session.shop);
  const form = await request.formData();
  const targetPlan = form.get("plan") as string;
  const storeSlug = session.shop.replace(".myshopify.com", "");
  const returnUrl = `https://admin.shopify.com/store/${storeSlug}/apps/${process.env.SHOPIFY_API_KEY}/app/billing/confirm`;

  if (targetPlan !== "basic" && targetPlan !== "pro") {
    return { error: "Invalid plan selected." };
  }

  const plan = targetPlan === "pro" ? BILLING_PLAN_PRO : BILLING_PLAN_BASIC;

  // Any existing subscription is cancelled in app.billing.confirm.tsx, only
  // after the merchant actually approves this new one — not here. Cancelling
  // eagerly, before Shopify's approval screen even loads, left a window where
  // a merchant who backed out (or just hadn't finished yet) had zero active
  // subscription and all their products got deactivated for nothing.
  const returnUrlWithIntent = `${returnUrl}?intendedPlan=${targetPlan}`;

  try {
    await billing.request({ plan, isTest, returnUrl: returnUrlWithIntent });
  } catch (err) {
    // billing.request throws a Response redirect on success — let it through
    if (err instanceof Response) throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[Billing] billing.request failed:", message);
    return { error: `Could not connect to Shopify billing. Please check your internet connection and try again.\n\nDetails: ${message}` };
  }

  return { error: "Billing redirect did not occur." };
};

// Restriction-backed rows are generated from PLAN_LIMITS itself (single
// source of truth shared with every server-side canUseFeature() gate) so
// this table can't drift from what's actually enforced for Basic/Pro. The
// 4 Enterprise-exclusive rows are flagged separately below — nothing calls
// canUseFeature() for those yet, since the features themselves don't exist.
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
  { key: "coreLimitedEditionSections", label: "Core vs. Limited-Edition report sections", comingSoon: true },
  { key: "deadStockAlerts", label: "Dead stock alerts", comingSoon: true },
  { key: "vendorGrouping", label: "Vendor grouping for purchase orders", comingSoon: true },
  { key: "vendorLeadTimeReorderPoints", label: "Reorder points by vendor lead time", comingSoon: true },
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

export default function BillingPage() {
  const { activePlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <s-page heading="Billing &amp; Plans" sub-heading="All plans include a 30-day free trial">
      <s-button slot="primary-action" variant="primary" href="/app">Back to Dashboard</s-button>

      {actionData && "error" in actionData && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "12px 16px", marginBottom: 16, color: "#991b1b" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Billing error</p>
          <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{actionData.error}</p>
        </div>
      )}

      <s-section heading="Plans">
        <PlanCards activePlan={activePlan} />
      </s-section>

      <s-section heading="Compare features">
        <FeatureComparisonTable />
      </s-section>

      <s-section heading="30-day free trial">
        <s-paragraph>
          Every plan starts with a 30-day free trial — no charge until the trial ends. Cancel anytime before the trial expires and you won't be billed.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

// Purchasable, in ascending tier order — drives both the display order and
// the "Upgrade to X" vs "Switch to X" button label (comparing index).
const PURCHASABLE_PLAN_KEYS = ["basic", "pro"] as const;
// Display order for the whole card row, including non-purchasable previews.
const PLAN_CARD_KEYS = ["basic", "pro", "enterprise"] as const;

// Per-tier visual accents that PLAN_LIMITS has no reason to know about
// (colors, "Most Popular" ribbon) — content (name/price/features/status)
// always comes from PLAN_LIMITS, never duplicated here.
const PLAN_ACCENT: Record<(typeof PLAN_CARD_KEYS)[number], { border: string; badgeBg: string; badgeColor: string; buttonBg: string | null; ribbon?: string }> = {
  basic: { border: "#3b82f6", badgeBg: "#dbeafe", badgeColor: "#1e40af", buttonBg: null },
  pro: { border: "#059669", badgeBg: "#d1fae5", badgeColor: "#065f46", buttonBg: "#059669", ribbon: "Most Popular" },
  enterprise: { border: "#e5e7eb", badgeBg: "#e0e7ff", badgeColor: "#4338ca", buttonBg: null },
};

function PlanCards({ activePlan }: { activePlan: "basic" | "pro" | null }) {
  const nav = useNavigation();
  const loading = nav.state === "submitting";
  const submittingPlan = loading ? (nav.formData?.get("plan") as string | null) : null;
  const activeTierIndex = activePlan ? PURCHASABLE_PLAN_KEYS.indexOf(activePlan) : -1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${PLAN_CARD_KEYS.length}, 1fr)`, gap: 20 }}>
      {PLAN_CARD_KEYS.map((key) => {
        const plan = PLAN_LIMITS[key];
        const accent = PLAN_ACCENT[key];
        const isCurrent = activePlan === key;
        const isPurchasable = plan.status === "active";
        const productsBullet = Number.isFinite(plan.maxProducts)
          ? `Up to ${formatMaxProducts(plan.maxProducts)} products`
          : "Unlimited products";
        const bullets = [...plan.features, productsBullet, "30-day free trial"];

        const tierIndex = isPurchasable ? PURCHASABLE_PLAN_KEYS.indexOf(key as "basic" | "pro") : -1;
        const buttonLabel =
          submittingPlan === key
            ? "Processing…"
            : activeTierIndex === -1
            ? "Start free trial"
            : tierIndex > activeTierIndex
            ? `Upgrade to ${plan.name}`
            : `Switch to ${plan.name}`;

        return (
          <div
            key={key}
            style={{
              border: isCurrent ? `2px solid ${accent.border}` : "1px solid #e5e7eb",
              borderRadius: 10, padding: 24, position: "relative", display: "flex", flexDirection: "column",
              opacity: plan.status === "coming_soon" ? 0.85 : 1,
            }}
          >
            {isCurrent && (
              <span style={{ position: "absolute", top: 12, right: 12, background: accent.badgeBg, color: accent.badgeColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                Current Plan
              </span>
            )}
            {!isCurrent && plan.status === "coming_soon" && (
              <span style={{ position: "absolute", top: 12, right: 12, background: accent.badgeBg, color: accent.badgeColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                Coming Soon
              </span>
            )}
            {accent.ribbon && (
              <span style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#008060", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 12, whiteSpace: "nowrap" }}>
                {accent.ribbon}
              </span>
            )}
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>{plan.name}</h2>
            <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>
              {plan.price}<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span>
            </p>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>30-day free trial</p>
            <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8, flex: 1 }}>
              {bullets.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
            </ul>
            {!isPurchasable ? (
              <button type="button" disabled style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", color: "#9ca3af", cursor: "not-allowed", fontSize: 14 }}>
                Coming Soon
              </button>
            ) : !isCurrent ? (
              <Form method="post">
                <input type="hidden" name="plan" value={key} />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%", padding: "8px 16px", borderRadius: 6,
                    border: accent.buttonBg ? "none" : "1px solid #d1d5db",
                    background: accent.buttonBg ?? "#fff",
                    color: accent.buttonBg ? "#fff" : "#111827",
                    cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: accent.buttonBg ? 600 : 400,
                  }}
                >
                  {buttonLabel}
                </button>
              </Form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ComparisonCell({ value, comingSoon }: { value: string | boolean; comingSoon?: boolean }) {
  if (typeof value === "string") return <>{value}</>;
  if (!value) return <span style={{ color: "#d1d5db" }}>—</span>;
  if (comingSoon) return <span style={{ color: "#4338ca", fontSize: 12, fontWeight: 600 }}>Coming Soon</span>;
  return <>✓</>;
}

function FeatureComparisonTable() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#6b7280", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em" }}>Feature</th>
            <th style={{ textAlign: "center", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#374151", fontWeight: 700 }}>Basic</th>
            <th style={{ textAlign: "center", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#059669", fontWeight: 700 }}>Professional</th>
            <th style={{ textAlign: "center", padding: "10px 12px", borderBottom: "2px solid #e5e7eb", color: "#4338ca", fontWeight: 700 }}>
              Enterprise <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>(Coming Soon)</span>
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

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
