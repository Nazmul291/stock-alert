import { authenticate } from "../shopify.server";
import { getIsTestStore } from "../services/billing.server";
import { isPlanKey, billingNameForPlanKey } from "./billing-plans";

type Auth = Awaited<ReturnType<typeof authenticate.admin>>;

// Shared by app._index.tsx's action (initial plan pick, step 3 of the inline
// wizard) and app.billing._index.tsx's action (later upgrades/switches) so
// the billing.request() call and its returnUrl aren't duplicated between
// them. Throws Shopify's own Response redirect to its billing approval
// screen on success — that hop out to Shopify and back through
// app.billing.confirm.tsx is inherent to how Shopify App Billing works and
// can't be done in-app.
export async function requestPlanSubscription(
  { admin, billing, session }: Pick<Auth, "admin" | "billing" | "session">,
  targetPlan: string | null,
): Promise<{ error: string }> {
  if (!isPlanKey(targetPlan)) {
    return { error: "Invalid plan selected." };
  }

  const isTest = await getIsTestStore(admin, session.shop);
  const plan = billingNameForPlanKey(targetPlan);
  const storeSlug = session.shop.replace(".myshopify.com", "");
  const returnUrl = `https://admin.shopify.com/store/${storeSlug}/apps/${process.env.SHOPIFY_API_KEY}/app/billing/confirm?intendedPlan=${targetPlan}`;

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
}
