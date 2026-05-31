import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // No customer PII stored — respond with 200
      break;

    case "SHOP_REDACT":
      // Delete all store data for the uninstalled shop
      await prisma.$transaction([
        prisma.alertHistory.deleteMany({ where: { shop } }),
        prisma.inventoryTracking.deleteMany({ where: { shop } }),
        prisma.storeSettings.deleteMany({ where: { shop } }),
        prisma.setupProgress.deleteMany({ where: { shop } }),
        prisma.session.deleteMany({ where: { shop } }),
      ]);
      break;
  }

  return new Response(null, { status: 200 });
};
