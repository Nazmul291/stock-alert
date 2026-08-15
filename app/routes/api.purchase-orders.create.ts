import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { createSupplier } from "../lib/supplier.server";
import { createPurchaseOrder, type CreatePurchaseOrderLine } from "../lib/purchase-order.server";

// The one canonical create-supplier / create-purchase-order endpoint, shared
// by the Purchase Orders page, the Products list page, and the product
// detail page (via purchase-order-actions-store.ts, called with a plain
// fetch() — not useFetcher()). Deliberately a resource route (no default
// export / UI component): React Router v7 runs in Single Fetch mode, where
// useFetcher() POSTs to a ".data"-suffixed URL and decodes a turbo-stream
// body, not a plain POST to the visible route path. A raw fetch() POST to a
// route that *does* have a component (e.g. app.purchase-orders._index.tsx)
// is treated as a normal document request — React Router runs the action,
// then every loader in the chain, and hands back a full rendered HTML page,
// not JSON. Same failure class as api.purchase-order-picker-stream.ts,
// which exists for the identical reason on the read side.
// Called from the app's own frontend only (same-origin) — no CORS
// preflight to handle here, unlike the admin extension's api.extension.*
// routes, which are called cross-origin from inside Shopify admin.
export const loader = () => new Response("Method Not Allowed", { status: 405 });

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;

  if (!canUseFeature(plan, "purchaseOrders")) {
    return Response.json({ success: false, error: "Purchase orders are an Enterprise plan feature." });
  }

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create_supplier") {
    const result = await createSupplier(shop, {
      name: (form.get("name") as string) ?? "",
      email: (form.get("email") as string) ?? "",
      phone: (form.get("phone") as string) ?? "",
      leadTimeDays: (form.get("leadTimeDays") as string) ?? "",
      contactName: (form.get("contactName") as string) ?? "",
      website: (form.get("website") as string) ?? "",
      address1: (form.get("address1") as string) ?? "",
      address2: (form.get("address2") as string) ?? "",
      city: (form.get("city") as string) ?? "",
      province: (form.get("province") as string) ?? "",
      zip: (form.get("zip") as string) ?? "",
      country: (form.get("country") as string) ?? "",
      paymentTerms: (form.get("paymentTerms") as string) ?? "",
      currency: (form.get("currency") as string) ?? "",
    });
    return Response.json(result);
  }

  if (intent === "create_po") {
    const supplierId = form.get("supplierId") as string;
    if (!supplierId) return Response.json({ success: false, error: "Select a supplier first." });
    const locationId = ((form.get("locationId") as string) ?? "").trim() || null;
    const locationName = ((form.get("locationName") as string) ?? "").trim() || null;
    // Only sent by the product-detail page's Create Purchase Order flow —
    // its presence is what makes the chosen supplier that product's
    // "supplier of record" below. Client-supplied now (not a route param),
    // so it gets a shape guard; the write itself is already shop-scoped, so
    // this is a data-shape guard, not an authorization one.
    const rawProductId = ((form.get("productId") as string) ?? "").trim();
    const productId = /^\d+$/.test(rawProductId) ? rawProductId : null;

    try {
      const rawLines = JSON.parse((form.get("lines") as string) ?? "[]") as CreatePurchaseOrderLine[];
      const lines = rawLines.map((l) => ({ ...l, locationId, locationName }));
      const po = await createPurchaseOrder(shop, supplierId, lines, admin, {
        referenceNumber: (form.get("referenceNumber") as string) ?? "",
        supplierNote: (form.get("supplierNote") as string) ?? "",
        terms: (form.get("terms") as string) ?? "",
        tags: JSON.parse((form.get("tags") as string) ?? "[]") as string[],
      });

      // Deliberately its own try/catch, after the PO is already committed —
      // a failure here must surface as a warning, not a failure, or the
      // merchant would retry an already-created order and end up with a
      // duplicate. Same reasoning as createPurchaseOrder's own
      // costSyncWarning.
      let supplierOfRecordWarning: string | null = null;
      if (productId) {
        try {
          await prisma.inventoryTracking.updateMany({
            where: { shop, productId: BigInt(productId) },
            data: { supplierId },
          });
        } catch (err) {
          supplierOfRecordWarning = `Purchase order created, but this product's supplier wasn't updated: ${err instanceof Error ? err.message : String(err)}`;
        }
      }

      invalidateShopCache(shop);
      return Response.json({ success: true, purchaseOrder: po, supplierOfRecordWarning });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create purchase order.";
      return Response.json({ success: false, error: message });
    }
  }

  return Response.json({ success: false, error: "Unknown action." });
};
