import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const { appSubscriptions } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
      isTest: process.env.TEST_PAYMENT === "true",
    });
    const activePlan = appSubscriptions.some((s: any) => s.name === BILLING_PLAN_PRO)
      ? "pro"
      : appSubscriptions.some((s: any) => s.name === BILLING_PLAN_BASIC)
      ? "basic"
      : null;

    if (activePlan) {
      await prisma.session.updateMany({
        where: { shop, isOnline: false },
        data: { plan: activePlan as any },
      });
    }
  } catch {
    // Non-fatal
  }

  const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  return { shop, plan: storeSession?.plan ?? "basic" };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const form = await request.formData();
  const targetPlan = form.get("plan") as string;

  if (targetPlan === "basic") {
    await billing.request({
      plan: BILLING_PLAN_BASIC,
      isTest: process.env.TEST_PAYMENT === "true",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
    });
  }

  if (targetPlan === "pro") {
    await billing.request({
      plan: BILLING_PLAN_PRO,
      isTest: process.env.TEST_PAYMENT === "true",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing`,
    });
  }

  return { error: "Invalid plan." };
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
  const { plan } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const loading = nav.state === "submitting";

  return (
    <s-page heading="Billing &amp; Plans" sub-heading="All plans include a 30-day free trial">
      <s-button slot="primary-action" href="/app">Back to Dashboard</s-button>

      {actionData && "error" in actionData && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#991b1b" }}>
          {actionData.error}
        </div>
      )}

      <s-section heading="Plans">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Basic plan */}
          <div style={{ border: plan === "basic" ? "2px solid #3b82f6" : "1px solid #e5e7eb", borderRadius: 10, padding: 24, position: "relative" }}>
            {plan === "basic" && (
              <span style={{ position: "absolute", top: 12, right: 12, background: "#dbeafe", color: "#1e40af", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                Current Plan
              </span>
            )}
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Basic</h2>
            <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>$3.99<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span></p>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>30-day free trial</p>
            <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8 }}>
              {BASIC_FEATURES.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
            </ul>
            {plan !== "basic" && (
              <Form method="post">
                <input type="hidden" name="plan" value="basic" />
                <button type="submit" disabled={loading} style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                  {loading ? "Processing…" : "Switch to Basic"}
                </button>
              </Form>
            )}
          </div>

          {/* Pro plan */}
          <div style={{ border: plan === "pro" ? "2px solid #059669" : "1px solid #e5e7eb", borderRadius: 10, padding: 24, position: "relative" }}>
            {plan === "pro" && (
              <span style={{ position: "absolute", top: 12, right: 12, background: "#d1fae5", color: "#065f46", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                Current Plan
              </span>
            )}
            <span style={{ position: "absolute", top: plan === "pro" ? 38 : 12, right: 12, background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
              Most Popular
            </span>
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Professional</h2>
            <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>$9.99<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span></p>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>30-day free trial</p>
            <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8 }}>
              {PRO_FEATURES.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
            </ul>
            {plan !== "pro" && (
              <Form method="post">
                <input type="hidden" name="plan" value="pro" />
                <button type="submit" disabled={loading} style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "none", background: "#059669", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                  {loading ? "Processing…" : "Upgrade to Professional"}
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
