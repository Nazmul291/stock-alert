import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // Stock Alert stores no customer PII beyond back-in-stock email addresses,
      // which are linked to the shop (not a Shopify customer ID) and are deleted
      // with the shop on uninstall. Nothing to redact per-customer.
      break;

    case "SHOP_REDACT":
      // Delete all store data when a merchant uninstalls and requests erasure.
      // SyncState and InventoryBuffer have no FK to Session, so they must be
      // deleted explicitly. All other models cascade from Session.
      await prisma.$transaction([
        prisma.inventoryBuffer.deleteMany({ where: { shop } }),
        prisma.syncState.deleteMany({ where: { shop } }),
        prisma.alertHistory.deleteMany({ where: { shop } }),
        prisma.inventoryTracking.deleteMany({ where: { shop } }),
        prisma.storeSettings.deleteMany({ where: { shop } }),
        prisma.setupProgress.deleteMany({ where: { shop } }),
        prisma.backInStockSubscriber.deleteMany({ where: { shop } }),
        prisma.session.deleteMany({ where: { shop } }),
      ]);
      break;
  }

  return new Response(null, { status: 200 });
};
