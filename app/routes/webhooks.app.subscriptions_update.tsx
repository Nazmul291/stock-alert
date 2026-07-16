import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { BILLING_PLAN_PRO, BILLING_PLAN_BASIC, BILLING_PLAN_ENTERPRISE } from "../shopify.server";
import { enforcePlanLimits } from "../lib/plan-enforcement";
import { invalidateShopCache } from "../lib/shop-cache.server";
import { getActiveSubscriptionPlan, invalidateBillingCache } from "../services/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const data = payload as { app_subscription?: { status?: string; name?: string } };
  const sub = data?.app_subscription;

  if (!sub) return new Response(null, { status: 200 });

  const status: string = sub.status ?? "";
  const name: string = sub.name ?? "";

  let plan: "basic" | "pro" | "enterprise" | null = null;

  if (status === "ACTIVE") {
    plan =
      name === BILLING_PLAN_ENTERPRISE ? "enterprise" : name === BILLING_PLAN_PRO ? "pro" : name === BILLING_PLAN_BASIC ? "basic" : null;
  }

  if (plan) {
    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan },
    });
    invalidateShopCache(shop);
    invalidateBillingCache(shop);
    console.log(`[Billing] Plan updated to ${plan} for ${shop} (subscription ${status})`);

    // Restore any products previously benched by plan-limit enforcement, up to
    // the new (possibly larger) cap — otherwise they'd stay "requires_upgrade"
    // until the next product sync.
    const enforcement = await enforcePlanLimits(shop, plan);
    if (enforcement.restoredCount > 0) {
      console.log(`[Billing] Plan ${plan} for ${shop}: restored ${enforcement.restoredCount} products`);
    }
  } else if (["DECLINED", "EXPIRED", "CANCELLED", "FROZEN"].includes(status)) {
    // This event can fire for a subscription the merchant already replaced —
    // e.g. upgrading Basic -> Pro cancels the old Basic subscription, which
    // then reports EXPIRED here after the new one is already ACTIVE. Confirm
    // with Shopify directly instead of assuming the shop has no plan at all.
    const currentPlan = await getActiveSubscriptionPlan(shop);
    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan: currentPlan },
    });
    invalidateShopCache(shop);
    invalidateBillingCache(shop);

    if (currentPlan) {
      console.log(`[Billing] Subscription ${status} for ${shop}, but shop still has an active ${currentPlan} subscription — plan left as ${currentPlan}`);
    } else {
      console.log(`[Billing] Subscription ${status} — cleared plan for ${shop}`);
      // Deactivate all tracked products immediately so merchants can't keep
      // benefiting from monitoring/alerts after their subscription lapses.
      const enforcement = await enforcePlanLimits(shop, null);
      if (enforcement.deactivatedCount > 0) {
        console.log(`[Billing] No active plan for ${shop}: deactivated ${enforcement.deactivatedCount} products`);
      }
    }
  }

  return new Response(null, { status: 200 });
};
