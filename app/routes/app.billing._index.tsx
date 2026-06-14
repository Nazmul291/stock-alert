import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import prisma from "../db.server";
import { getIsTestStore } from "../services/billing.server";
import { invalidateShopCache } from "../lib/shop-cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const isTest = await getIsTestStore(admin);

  let activePlan: "basic" | "pro" | null = null;
  try {
    const { appSubscriptions } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
      isTest,
    });
    activePlan = appSubscriptions.some((s: any) => s.name === BILLING_PLAN_PRO)
      ? "pro"
      : appSubscriptions.some((s: any) => s.name === BILLING_PLAN_BASIC)
      ? "basic"
      : null;

    if (activePlan) {
      await prisma.session.updateMany({
        where: { shop, isOnline: false },
        data: { plan: activePlan as any },
      });
      invalidateShopCache(shop);
    }
  } catch {
    // Non-fatal — activePlan stays null
  }

  return { shop, activePlan };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const isTest = await getIsTestStore(admin);
  const form = await request.formData();
  const targetPlan = form.get("plan") as string;
  const storeSlug = session.shop.replace(".myshopify.com", "");
  const returnUrl = `https://admin.shopify.com/store/${storeSlug}/apps/${process.env.SHOPIFY_API_KEY}/app/billing/confirm`;

  if (targetPlan !== "basic" && targetPlan !== "pro") {
    return { error: "Invalid plan selected." };
  }

  const plan = targetPlan === "pro" ? BILLING_PLAN_PRO : BILLING_PLAN_BASIC;

  // Cancel any active subscription before requesting a new plan to prevent double-billing
  try {
    const { appSubscriptions } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
      isTest,
    });
    for (const sub of appSubscriptions) {
      await billing.cancel({
        subscriptionId: sub.id,
        isTest,
        prorate: false,
      });
    }
  } catch {
    // No active subscription to cancel — proceed normally
  }

  try {
    await billing.request({ plan, isTest, returnUrl });
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
  "Global threshold settings",
  "Basic inventory tracking",
  "Up to 1,000 products",
];

const PRO_FEATURES = [
  "Everything in Basic, plus:",
  "Slack notifications",
  "Per-product thresholds",
  "Auto-republish when restocked",
  "Multiple notification recipients",
  "Priority support",
  "Up to 10,000 products",
];

export default function BillingPage() {
  const { activePlan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const loading = nav.state === "submitting";
  const submittingPlan = loading ? (nav.formData?.get("plan") as string | null) : null;

  return (
    <s-page heading="Billing &amp; Plans" sub-heading="All plans include a 30-day free trial">
      <s-button slot="primary-action" href="/app">Back to Dashboard</s-button>

      {actionData && "error" in actionData && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "12px 16px", marginBottom: 16, color: "#991b1b" }}>
          <p style={{ margin: "0 0 4px", fontWeight: 600 }}>Billing error</p>
          <p style={{ margin: 0, fontSize: 13, whiteSpace: "pre-wrap" }}>{actionData.error}</p>
        </div>
      )}

      <s-section heading="Plans">
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
      </s-section>

      <s-section heading="30-day free trial">
        <s-paragraph>
          Every plan starts with a 30-day free trial — no charge until the trial ends. Cancel anytime before the trial expires and you won't be billed.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
