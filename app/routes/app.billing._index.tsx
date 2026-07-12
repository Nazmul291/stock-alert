import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import { getIsTestStore } from "../services/billing.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { BillingPlanCards } from "../components/BillingPlanCards";
import { BillingFeatureComparisonTable } from "../components/BillingFeatureComparisonTable";

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
        <BillingPlanCards activePlan={activePlan} />
      </s-section>

      <s-section heading="Compare features">
        <BillingFeatureComparisonTable />
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
