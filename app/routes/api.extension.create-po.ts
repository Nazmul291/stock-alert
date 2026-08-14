import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { extensionCorsPreflight, extensionJSON } from "../lib/extension-cors.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { createPurchaseOrder, type CreatePurchaseOrderLine } from "../lib/purchase-order.server";
import prisma from "../db.server";

// OPTIONS preflight lands here (see extension-cors.server.ts) — this route
// otherwise only supports POST.
export const loader = ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return extensionCorsPreflight();
  return new Response("Method Not Allowed", { status: 405 });
};

export const action = ({ request }: ActionFunctionArgs) =>
  extensionJSON(request, async ({ admin, shop }) => {
    const storeSession = await getCachedSession(shop);
    const plan = storeSession?.plan ?? "basic";
    if (!canUseFeature(plan, "purchaseOrders")) {
      return { success: false as const, error: "Suppliers and purchase orders are an Enterprise plan feature." };
    }

    const body = (await request.json()) as { productId?: string; supplierId?: string; lines?: CreatePurchaseOrderLine[] };
    const productId = body.productId;
    const supplierId = body.supplierId;
    const lines = body.lines ?? [];
    if (!productId) return { success: false as const, error: "Missing product id." };
    if (!supplierId) return { success: false as const, error: "Select a supplier first." };

    try {
      const po = await createPurchaseOrder(shop, supplierId, lines, admin);
      // Ordering from a supplier for this product makes them the product's
      // supplier of record going forward — same as the web product-detail
      // page's create_po intent (app.products.$productId.tsx).
      await prisma.inventoryTracking.updateMany({
        where: { shop, productId: BigInt(productId) },
        data: { supplierId },
      });
      invalidateShopCache(shop);
      // Built server-side because the extension sandbox has no access to
      // the app's own API key — the "View Purchase Order" button on the
      // success screen just uses this directly, same admin deep-link
      // pattern as the email templates' CTA buttons.
      const purchaseOrderUrl = `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/apps/${process.env.SHOPIFY_API_KEY}/app/purchase-orders/${po.purchaseOrderId}`;
      return { success: true as const, ...po, purchaseOrderUrl };
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : "Failed to create purchase order." };
    }
  });
