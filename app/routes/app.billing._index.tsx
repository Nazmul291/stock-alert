import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import { getIsTestStore } from "../services/billing.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { PLAN_LIMITS } from "../lib/plan-limits";

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

const BASIC_FEATURES = [
  "Auto-hide sold-out products",
  "Email notifications",
  "Shopify Flow triggers",
  "Back-in-stock storefront widget",
  "Global threshold settings",
  "Basic inventory tracking",
];

const PRO_FEATURES = [
  "Everything in Basic, plus:",
  "One-click Slack Connect",
  "Asana task creation",
  "Klaviyo integration",
  "Outbound webhook (Zapier/Make/ERP)",
  "Per-product thresholds",
  "Auto-republish when restocked",
  "Multiple notification recipients",
];

// Restriction-backed rows are generated from PLAN_LIMITS itself (single
// source of truth shared with every server-side canUseFeature() gate) so
// this table can't drift from what's actually enforced. Baseline rows below
// (available on both plans, no restriction key) stay hand-written since
// there's nothing in PLAN_LIMITS to derive them from.
const RESTRICTION_ROWS: { key: keyof typeof PLAN_LIMITS.basic.restrictions; label: string }[] = [
  { key: "slackNotifications", label: "One-click Slack Connect" },
  { key: "asanaTaskCreation", label: "Asana task creation" },
  { key: "klaviyoIntegration", label: "Klaviyo integration" },
  { key: "outboundWebhook", label: "Outbound webhook (Zapier/Make/ERP)" },
  { key: "perProductThresholds", label: "Per-product thresholds" },
  { key: "autoRepublish", label: "Auto-republish when restocked" },
  { key: "multipleRecipients", label: "Multiple notification recipients" },
  { key: "whiteLabelEmails", label: "White-label branded emails" },
  { key: "prioritySupport", label: "Priority support" },
];

// Full side-by-side breakdown shown below the plan cards — includes rows
// (like product limits and priority support) that were trimmed from the
// per-card bullet lists above to keep those short and scannable.
const FEATURE_COMPARISON: { label: string; basic: string | boolean; pro: string | boolean }[] = [
  { label: "Products tracked", basic: PLAN_LIMITS.basic.maxProducts.toLocaleString(), pro: PLAN_LIMITS.pro.maxProducts.toLocaleString() },
  { label: "Email notifications", basic: true, pro: true },
  { label: "Auto-hide sold-out products", basic: true, pro: true },
  { label: "Shopify Flow triggers", basic: true, pro: true },
  { label: "Back-in-stock storefront widget", basic: true, pro: true },
  { label: "Global threshold settings", basic: true, pro: true },
  ...RESTRICTION_ROWS.map(({ key, label }) => ({
    label,
    basic: PLAN_LIMITS.basic.restrictions[key],
    pro: PLAN_LIMITS.pro.restrictions[key],
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

function PlanCards({ activePlan }: { activePlan: "basic" | "pro" | null }) {
  const nav = useNavigation();
  const loading = nav.state === "submitting";
  const submittingPlan = loading ? (nav.formData?.get("plan") as string | null) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* Basic plan */}
      <div style={{ border: activePlan === "basic" ? "2px solid #3b82f6" : "1px solid #e5e7eb", borderRadius: 10, padding: 24, position: "relative", display: "flex", flexDirection: "column" }}>
        {activePlan === "basic" && (
          <span style={{ position: "absolute", top: 12, right: 12, background: "#dbeafe", color: "#1e40af", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
            Current Plan
          </span>
        )}
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Basic</h2>
        <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>$3.99<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span></p>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>30-day free trial</p>
        <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8, flex: 1 }}>
          {BASIC_FEATURES.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
        </ul>
        {activePlan !== "basic" && (
          <Form method="post">
            <input type="hidden" name="plan" value="basic" />
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 14 }}>
              {submittingPlan === "basic" ? "Processing…" : activePlan === "pro" ? "Switch to Basic" : "Start free trial"}
            </button>
          </Form>
        )}
      </div>

      {/* Pro plan */}
      <div style={{ border: activePlan === "pro" ? "2px solid #059669" : "1px solid #e5e7eb", borderRadius: 10, padding: 24, position: "relative", display: "flex", flexDirection: "column" }}>
        {activePlan === "pro" && (
          <span style={{ position: "absolute", top: 12, right: 12, background: "#d1fae5", color: "#065f46", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
            Current Plan
          </span>
        )}
        <span style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#008060", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 12, whiteSpace: "nowrap" }}>
          Most Popular
        </span>
        <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Professional</h2>
        <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>$9.99<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span></p>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>30-day free trial</p>
        <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8, flex: 1 }}>
          {PRO_FEATURES.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
        </ul>
        {activePlan !== "pro" && (
          <Form method="post">
            <input type="hidden" name="plan" value="pro" />
            <button type="submit" disabled={loading} style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
              {submittingPlan === "pro" ? "Processing…" : activePlan === "basic" ? "Upgrade to Professional" : "Start free trial"}
            </button>
          </Form>
        )}
      </div>
    </div>
  );
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
          </tr>
        </thead>
        <tbody>
          {FEATURE_COMPARISON.map((row) => (
            <tr key={row.label} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "10px 12px", color: "#111827" }}>{row.label}</td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                {typeof row.basic === "string" ? row.basic : (row.basic ? "✓" : <span style={{ color: "#d1d5db" }}>—</span>)}
              </td>
              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                {typeof row.pro === "string" ? row.pro : (row.pro ? "✓" : <span style={{ color: "#d1d5db" }}>—</span>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
