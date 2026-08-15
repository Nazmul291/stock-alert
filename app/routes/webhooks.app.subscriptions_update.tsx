import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { planKeyForBillingName, type PlanKey } from "../lib/billing-plans";
import { enforcePlanLimits } from "../lib/plan-enforcement";
import { setInventoryItemMapPlan } from "../lib/inventory-item-map.server";
import { invalidateShopCache } from "../lib/shop-cache.server";
import { getActiveSubscriptionPlan, invalidateBillingCache } from "../services/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const data = payload as { app_subscription?: { status?: string; name?: string } };
  const sub = data?.app_subscription;

  if (!sub) return new Response(null, { status: 200 });

  const status: string = sub.status ?? "";
  const name: string = sub.name ?? "";

  let plan: PlanKey | null = null;

  if (status === "ACTIVE") {
    plan = planKeyForBillingName(name);
  }

  if (plan) {
    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan },
    });
    // inventory_item_map carries a denormalized plan so the inventory webhook
    // can gate on it in one read — one bulk UPDATE, not a write per item.
    await setInventoryItemMapPlan(shop, plan).catch((err) =>
      console.error("[Billing] inventory_item_map plan sync failed:", err),
    );
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
    await setInventoryItemMapPlan(shop, currentPlan).catch((err) =>
      console.error("[Billing] inventory_item_map plan sync failed:", err),
    );
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
