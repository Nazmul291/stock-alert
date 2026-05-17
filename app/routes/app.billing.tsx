import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_PRO } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  // Sync plan from active Shopify subscription
  try {
    const { hasActivePayment } = await billing.check({ plans: [BILLING_PLAN_PRO], isTest: process.env.TEST_PAYMENT === "true" });
    if (hasActivePayment) {
      await prisma.session.updateMany({ where: { shop: session.shop, isOnline: false }, data: { plan: "pro" } });
    }
  } catch {
    // Non-fatal: billing check failed
  }
  const shop = session.shop;
  const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  return { shop, plan: storeSession?.plan ?? "free" };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const targetPlan = form.get("plan") as string;

  if (targetPlan === "pro") {
    // billing.request throws a redirect — nothing to return
    await billing.request({
      plan: BILLING_PLAN_PRO,
      isTest: process.env.TEST_PAYMENT === "true",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing?billing=success`,
    });
  }

  if (targetPlan === "free") {
    try {
      const { appSubscriptions } = await billing.check({ plans: [BILLING_PLAN_PRO], isTest: process.env.TEST_PAYMENT === "true" });
      if (appSubscriptions.length > 0) {
        await billing.cancel({ subscriptionId: appSubscriptions[0].id, isTest: process.env.TEST_PAYMENT === "true", prorate: false });
      }
    } catch {
      // No active subscription to cancel — silently ignore
    }
    await prisma.session.updateMany({ where: { shop, isOnline: false }, data: { plan: "free" } });
    return { success: true, message: "Downgraded to Free plan." };
  }

  return { error: "Invalid plan." };
};

const FREE_FEATURES = [
  "Auto-hide sold-out products",
  "Email notifications",
  "Global threshold settings",
  "Basic inventory tracking",
  "Up to 10 products",
];

const PRO_FEATURES = [
  "Everything in Free, plus:",
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
    <s-page heading="Billing &amp; Plans" sub-heading="Choose the plan that works best for your store">
      <s-button slot="primary-action" href="/app">Back to Dashboard</s-button>

      {actionData && "error" in actionData && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#991b1b" }}>
          {actionData.error}
        </div>
      )}
      {actionData && "message" in actionData && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#065f46" }}>
          {actionData.message}
        </div>
      )}

      <s-section heading="Plans">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Free plan */}
          <div style={{ border: plan === "free" ? "2px solid #3b82f6" : "1px solid #e5e7eb", borderRadius: 10, padding: 24, position: "relative" }}>
            {plan === "free" && (
              <span style={{ position: "absolute", top: 12, right: 12, background: "#dbeafe", color: "#1e40af", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                Current Plan
              </span>
            )}
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Free</h2>
            <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 16px" }}>$0<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span></p>
            <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8 }}>
              {FREE_FEATURES.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
            </ul>
            {plan === "pro" && (
              <Form method="post">
                <input type="hidden" name="plan" value="free" />
                <button type="submit" disabled={loading} style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                  {loading ? "Processing…" : "Downgrade to Free"}
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
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Professional</h2>
            <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>$9.99<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span></p>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>7-day free trial</p>
            <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8 }}>
              {PRO_FEATURES.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
            </ul>
            {plan === "free" && (
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

      {plan === "free" && (
        <s-section heading="Why upgrade?">
          <s-paragraph>
            Professional unlocks Slack notifications, per-product thresholds, auto-republish on restock,
            and the ability to monitor up to 10,000 products — with a 7-day free trial so you can try before you commit.
          </s-paragraph>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
