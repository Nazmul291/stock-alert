export const BILLING_PLAN_BASIC = "Basic";
export const BILLING_PLAN_PRO = "Professional";
export const BILLING_PLAN_ENTERPRISE = "Enterprise";

export type PlanKey = "basic" | "pro" | "enterprise";

// The literal union billing.request()/billing.check() expect — kept distinct
// from `string` so billingNameForPlanKey's return type stays assignable to
// shopify.server.ts's billing config keys instead of widening to `string`.
type BillingPlanName = typeof BILLING_PLAN_BASIC | typeof BILLING_PLAN_PRO | typeof BILLING_PLAN_ENTERPRISE;

// Highest tier first — every place that needs to pick "the best plan when
// more than one Shopify subscription name is present" (webhook
// reconciliation, billing-confirmation fallback when a plan switch briefly
// leaves both the old and new subscription active) shares this one order
// instead of each re-deriving its own Enterprise > Pro > Basic chain.
const PLAN_ORDER: { key: PlanKey; name: BillingPlanName }[] = [
  { key: "enterprise", name: BILLING_PLAN_ENTERPRISE },
  { key: "pro", name: BILLING_PLAN_PRO },
  { key: "basic", name: BILLING_PLAN_BASIC },
];

export function isPlanKey(value: string | null | undefined): value is PlanKey {
  return value === "basic" || value === "pro" || value === "enterprise";
}

export function billingNameForPlanKey(key: PlanKey): BillingPlanName {
  return PLAN_ORDER.find((p) => p.key === key)!.name;
}

export function planKeyForBillingName(name: string | null | undefined): PlanKey | null {
  return PLAN_ORDER.find((p) => p.name === name)?.key ?? null;
}

// Given items carrying a Shopify subscription `name` (e.g. billing.check()'s
// appSubscriptions, or a GraphQL activeSubscriptions list), returns whichever
// one matches the highest-tier known plan, or undefined if none match.
export function pickHighestPriority<T extends { name: string }>(items: T[]): T | undefined {
  for (const { name } of PLAN_ORDER) {
    const match = items.find((item) => item.name === name);
    if (match) return match;
  }
  return undefined;
}
