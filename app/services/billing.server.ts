import { authenticate, unauthenticated } from "../shopify.server";
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

// In-process fallback used when REDIS_URL is not set (e.g. local dev).
// Without this, every page navigation made two sequential Shopify API calls
// (isTest + billing.check), adding 400–1000 ms of latency per navigation.
const memCache = new Map<string, { value: string; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memCache) if (now > v.expiresAt) memCache.delete(k);
}, 30_000).unref?.();

function memGet(key: string): string | undefined {
  const entry = memCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.value;
  return undefined;
}

function memSet(key: string, value: string, ttlSeconds: number): void {
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function cacheGet(key: string): Promise<string | undefined> {
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw === null ? undefined : raw;
    } catch {
      return undefined;
    }
  }
  return memGet(key);
}

function cacheSet(key: string, value: string, ttlSeconds: number): void {
  if (redis) {
    redis.set(key, value, "EX", ttlSeconds).catch(() => {});
  } else {
    memSet(key, value, ttlSeconds);
  }
}

export async function getIsTestStore(admin: AdminClient, shop?: string): Promise<boolean> {
  if (process.env.TEST_PAYMENT === "true") return true;

  const cacheKey = shop ? `test-store:${shop}` : null;
  if (cacheKey) {
    const cached = await cacheGet(cacheKey);
    if (cached !== undefined) return cached === "1";
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

  if (cacheKey) cacheSet(cacheKey, isTest ? "1" : "0", TEST_STORE_TTL_SECONDS);
  return isTest;
}

// Used on every /app/* page load to gate access behind an active subscription.
// Cached briefly so rapid navigation within the embedded app doesn't re-hit
// Shopify's billing API on every single page.
export function invalidateBillingCache(shop: string): void {
  memCache.delete(`test-store:${shop}`);
  memCache.delete(`billing:${shop}`);
}

export async function getCachedHasActivePayment(
  shop: string,
  isTest: boolean,
  billing: BillingClient,
): Promise<boolean> {
  const cacheKey = `billing:${shop}`;
  const cached = await cacheGet(cacheKey);
  if (cached !== undefined) return cached === "1";

  const { hasActivePayment } = await billing.check({
    plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
    isTest,
  });

  cacheSet(cacheKey, hasActivePayment ? "1" : "0", BILLING_STATUS_TTL_SECONDS);
  return hasActivePayment;
}

// SSE routes run outside a request-authenticated session (EventSource can't send
// the Authorization header Shopify's session-token auth needs), so they can't use
// the request-bound `billing` client above. This queries the same underlying data
// billing.check() does, via the shop's stored offline access token instead.
// Shares the same cache key/TTL, so whichever path populates the cache first is
// reused by the other.
export async function getCachedHasActivePaymentOffline(shop: string, isTest: boolean): Promise<boolean> {
  const cacheKey = `billing:${shop}`;
  const cached = await cacheGet(cacheKey);
  if (cached !== undefined) return cached === "1";

  const { admin } = await unauthenticated.admin(shop);
  const res = await admin.graphql(
    `#graphql
    query {
      currentAppInstallation {
        activeSubscriptions { name test }
        oneTimePurchases(first: 250, sortKey: CREATED_AT) {
          edges { node { name test status } }
        }
      }
    }`,
  );
  const data = await res.json();
  const installation = data.data?.currentAppInstallation;
  const plans = [BILLING_PLAN_BASIC, BILLING_PLAN_PRO];

  const hasActivePayment =
    (installation?.activeSubscriptions ?? []).some(
      (s: { name: string; test: boolean }) => plans.includes(s.name) && (isTest || !s.test),
    ) ||
    (installation?.oneTimePurchases?.edges ?? []).some(
      ({ node }: { node: { name: string; test: boolean; status: string } }) =>
        plans.includes(node.name) && (isTest || !node.test) && node.status === "ACTIVE",
    );

  cacheSet(cacheKey, hasActivePayment ? "1" : "0", BILLING_STATUS_TTL_SECONDS);
  return hasActivePayment;
}

// Used by the subscriptions_update webhook to confirm a shop's true plan
// before clearing it. A lapsed/cancelled subscription event can arrive after
// the merchant already switched to a different plan (e.g. upgrading Basic ->
// Pro cancels the old Basic subscription, which then reports EXPIRED here
// after the new one is already ACTIVE) — so this always hits Shopify live
// rather than trusting the event in isolation.
export async function getActiveSubscriptionPlan(shop: string): Promise<"basic" | "pro" | null> {
  try {
    const { admin } = await unauthenticated.admin(shop);
    const res = await admin.graphql(
      `#graphql
      query { currentAppInstallation { activeSubscriptions { name } } }`,
    );
    const data = await res.json();
    const subs: { name: string }[] = data.data?.currentAppInstallation?.activeSubscriptions ?? [];
    if (subs.some((s) => s.name === BILLING_PLAN_PRO)) return "pro";
    if (subs.some((s) => s.name === BILLING_PLAN_BASIC)) return "basic";
    return null;
  } catch {
    return null;
  }
}
