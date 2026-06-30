import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { invalidateShopCache } from "../lib/shop-cache.server";
import { invalidateBillingCache } from "../services/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  // Evict all in-memory and Redis cache entries for this shop before deleting
  // DB rows — ensures no stale session/settings/billing data lingers in memory
  // on the same process after the shop data is gone.
  await invalidateShopCache(shop);
  invalidateBillingCache(shop);

  await prisma.$transaction([
    prisma.inventoryBuffer.deleteMany({ where: { shop } }),
    prisma.syncState.deleteMany({ where: { shop } }),
    prisma.chatConversation.deleteMany({ where: { shopId: shop } }),
    prisma.alertHistory.deleteMany({ where: { shop } }),
    prisma.inventoryTracking.deleteMany({ where: { shop } }),
    prisma.storeSettings.deleteMany({ where: { shop } }),
    prisma.setupProgress.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response(null, { status: 200 });
};
