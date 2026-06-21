import { authenticate } from "../shopify.server";
import { BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../lib/billing-plans";
import { redis } from "../lib/redis.server";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];
type BillingClient = Awaited<ReturnType<typeof authenticate.admin>>["billing"];

// partnerDevelopment essentially never changes for a shop's lifetime, so this
// is safe to cache for a long time and saves a Shopify API call on every page load.
const TEST_STORE_TTL_SECONDS = 24 * 60 * 60;
// hasActivePayment can change (cancellation, trial conversion), so this TTL is
// short — just long enough to avoid re-checking on every nav within the embedded app.
const BILLING_STATUS_TTL_SECONDS = 60;

export async function getIsTestStore(admin: AdminClient, shop?: string): Promise<boolean> {
  if (process.env.TEST_PAYMENT === "true") return true; // force test mode override

  const cacheKey = shop ? `test-store:${shop}` : null;
  if (cacheKey && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) return cached === "1";
    } catch {
      // best-effort — fall through to the live check
    }
  }

  let isTest = false;
  try {
    const res = await admin.graphql(
      `#graphql
      query { shop { plan { partnerDevelopment } } }`,
    );
    const data = await res.json();
    isTest = data.data?.shop?.plan?.partnerDevelopment === true;
  } catch {
    isTest = false;
  }

  if (cacheKey && redis) {
    redis.set(cacheKey, isTest ? "1" : "0", "EX", TEST_STORE_TTL_SECONDS).catch(() => {});
  }
  return isTest;
}

// Used on every /app/* page load to gate access behind an active subscription.
// Cached briefly so rapid navigation within the embedded app doesn't re-hit
// Shopify's billing API on every single page.
export async function getCachedHasActivePayment(
  shop: string,
  isTest: boolean,
  billing: BillingClient,
): Promise<boolean> {
  const cacheKey = `billing:${shop}`;
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) return cached === "1";
    } catch {
      // best-effort — fall through to the live check
    }
  }

  const { hasActivePayment } = await billing.check({
    plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
    isTest,
  });

  if (redis) {
    redis.set(cacheKey, hasActivePayment ? "1" : "0", "EX", BILLING_STATUS_TTL_SECONDS).catch(() => {});
  }
  return hasActivePayment;
}
