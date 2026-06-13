import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { BILLING_PLAN_PRO, BILLING_PLAN_BASIC } from "../shopify.server";
import { enforcePlanLimits } from "../lib/plan-enforcement";

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
    console.log(`[Billing] Plan updated to ${plan} for ${shop} (subscription ${status})`);
  } else if (["DECLINED", "EXPIRED", "CANCELLED", "FROZEN"].includes(status)) {
    // Subscription lapsed — downgrade to basic so Pro features are revoked promptly.
    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan: "basic" },
    });
    console.log(`[Billing] Subscription ${status} — downgraded ${shop} to basic`);
    // Enforce the Basic product limit immediately so merchants can't keep benefiting
    // from Pro-tier tracking after their subscription lapses.
    const enforcement = await enforcePlanLimits(shop, "basic");
    if (enforcement.deactivatedCount > 0) {
      console.log(`[Billing] Enforced Basic limit for ${shop}: deactivated ${enforcement.deactivatedCount} products over the ${enforcement.maxAllowed} cap`);
    }
  }

  return new Response(null, { status: 200 });
};
