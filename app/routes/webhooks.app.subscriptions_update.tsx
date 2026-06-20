import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { BILLING_PLAN_PRO, BILLING_PLAN_BASIC } from "../shopify.server";
import { enforcePlanLimits } from "../lib/plan-enforcement";
import { invalidateShopCache } from "../lib/shop-cache.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const data = payload as any;
  const sub = data?.app_subscription;

  if (!sub) return new Response(null, { status: 200 });

  const status: string = sub.status ?? "";
  const name: string = sub.name ?? "";

  let plan: "basic" | "pro" | null = null;

  if (status === "ACTIVE") {
    plan = name === BILLING_PLAN_PRO ? "pro" : name === BILLING_PLAN_BASIC ? "basic" : null;
  }

  if (plan) {
    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan },
    });
    invalidateShopCache(shop);
    console.log(`[Billing] Plan updated to ${plan} for ${shop} (subscription ${status})`);
  } else if (["DECLINED", "EXPIRED", "CANCELLED", "FROZEN"].includes(status)) {
    // Subscription lapsed — clear the plan entirely. Basic is a paid tier too,
    // so a lapsed subscriber has no plan at all, not a "free" Basic fallback.
    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan: null },
    });
    invalidateShopCache(shop);
    console.log(`[Billing] Subscription ${status} — cleared plan for ${shop}`);
    // Deactivate all tracked products immediately so merchants can't keep
    // benefiting from monitoring/alerts after their subscription lapses.
    const enforcement = await enforcePlanLimits(shop, null);
    if (enforcement.deactivatedCount > 0) {
      console.log(`[Billing] No active plan for ${shop}: deactivated ${enforcement.deactivatedCount} products`);
    }
  }

  return new Response(null, { status: 200 });
};
