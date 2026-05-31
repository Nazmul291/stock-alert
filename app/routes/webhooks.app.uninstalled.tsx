import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  await prisma.$transaction([
    prisma.inventoryBuffer.deleteMany({ where: { shop } }),
    prisma.chatConversation.deleteMany({ where: { shopId: shop } }),
    prisma.alertHistory.deleteMany({ where: { shop } }),
    prisma.inventoryTracking.deleteMany({ where: { shop } }),
    prisma.storeSettings.deleteMany({ where: { shop } }),
    prisma.setupProgress.deleteMany({ where: { shop } }),
    prisma.session.deleteMany({ where: { shop } }),
  ]);

  return new Response(null, { status: 200 });
};
