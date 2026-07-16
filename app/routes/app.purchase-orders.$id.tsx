import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { sendPurchaseOrderEmail } from "../lib/notifications";
import { receivePurchaseOrderItems, sanitizeQuantity, sanitizeUnitCost } from "../lib/purchase-order.server";
import { PurchaseOrderDetail, type PurchaseOrderDetailData } from "../components/purchase-orders/PurchaseOrderDetail";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;

  if (!canUseFeature(plan, "purchaseOrders")) {
    throw new Response("Purchase orders are an Enterprise plan feature.", { status: 403 });
  }

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: params.id, shop },
    include: { supplier: true, lineItems: { orderBy: { createdAt: "asc" } } },
  });
  if (!po) throw new Response("Not Found", { status: 404 });

  const data: PurchaseOrderDetailData = {
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    totalCost: po.totalCost,
    sentToSupplierAt: po.sentToSupplierAt?.toISOString() ?? null,
    orderedAt: po.orderedAt?.toISOString() ?? null,
    receivedAt: po.receivedAt?.toISOString() ?? null,
    createdAt: po.createdAt.toISOString(),
    supplier: { id: po.supplier.id, name: po.supplier.name, email: po.supplier.email },
    lineItems: po.lineItems.map((li) => ({
      id: li.id,
      variantId: li.variantId.toString(),
      productTitle: li.productTitle,
      variantTitle: li.variantTitle,
      sku: li.sku,
      quantityOrdered: li.quantityOrdered,
      quantityReceived: li.quantityReceived,
      unitCost: li.unitCost,
    })),
  };

  return { po: data };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const id = params.id as string;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;

  if (!canUseFeature(plan, "purchaseOrders")) {
    return { success: false as const, error: "Purchase orders are an Enterprise plan feature." };
  }

  const po = await prisma.purchaseOrder.findFirst({ where: { id, shop }, include: { lineItems: true } });
  if (!po) return { success: false as const, error: "Purchase order not found." };

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "update_line_items") {
    if (po.status !== "draft") {
      return { success: false as const, error: "Only a draft purchase order can be edited." };
    }
    try {
      const updates = JSON.parse((form.get("lineItems") as string) ?? "[]") as { id: string; quantityOrdered: number; unitCost: number | null }[];

      await prisma.$transaction(
        updates.map((u) =>
          prisma.purchaseOrderLineItem.updateMany({
            where: { id: u.id, purchaseOrderId: id },
            data: { quantityOrdered: sanitizeQuantity(u.quantityOrdered), unitCost: sanitizeUnitCost(u.unitCost) },
          }),
        ),
      );
      const refreshed = await prisma.purchaseOrderLineItem.findMany({ where: { purchaseOrderId: id } });
      const totalCost = refreshed.reduce((sum, li) => sum + li.quantityOrdered * (li.unitCost ?? 0), 0);
      await prisma.purchaseOrder.updateMany({ where: { id, shop }, data: { totalCost } });
      invalidateShopCache(shop);
      return { success: true as const, intent };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update line items.";
      return { success: false as const, error: message };
    }
  }

  if (intent === "mark_ordered") {
    if (po.status !== "draft") {
      return { success: false as const, error: "Only a draft purchase order can be marked as ordered." };
    }
    if (po.lineItems.length === 0) {
      return { success: false as const, error: "Add at least one line item first." };
    }
    await prisma.purchaseOrder.updateMany({ where: { id, shop }, data: { status: "ordered", orderedAt: new Date() } });
    invalidateShopCache(shop);
    return { success: true as const, intent };
  }

  if (intent === "send_to_supplier") {
    if (po.status !== "draft" && po.status !== "ordered") {
      return { success: false as const, error: "This purchase order can no longer be sent." };
    }
    // Fire-and-forget — same detached-async pattern as app.products.tsx's
    // "sync" intent. The email send re-fetches the PO itself, so it doesn't
    // depend on this request's context still being alive when it resolves.
    sendPurchaseOrderEmail(shop, id)
      .then(async (result) => {
        if (result.success) {
          await prisma.purchaseOrder.updateMany({ where: { id, shop }, data: { sentToSupplierAt: new Date() } });
          invalidateShopCache(shop);
        } else {
          console.error(`[PO] Email failed for PO ${id}:`, result.error);
        }
      })
      .catch((err) => console.error(`[PO] Email failed for PO ${id}:`, err));
    return { success: true as const, intent, message: "Sending email…" };
  }

  if (intent === "receive_items") {
    if (po.status !== "ordered" && po.status !== "partially_received") {
      return { success: false as const, error: "This purchase order is not awaiting receipt." };
    }
    try {
      const receipts = JSON.parse((form.get("receipts") as string) ?? "[]") as { lineItemId: string; quantityReceived: number }[];
      await receivePurchaseOrderItems(shop, id, receipts, admin);
      invalidateShopCache(shop);
      return { success: true as const, intent };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to receive items.";
      return { success: false as const, error: message };
    }
  }

  if (intent === "cancel_po") {
    if (po.status === "received") {
      return { success: false as const, error: "Cannot cancel a fully received purchase order." };
    }
    await prisma.purchaseOrder.updateMany({ where: { id, shop }, data: { status: "cancelled" } });
    invalidateShopCache(shop);
    return { success: true as const, intent };
  }

  return { success: false as const, error: "Unknown action." };
};

export default function PurchaseOrderDetailPage() {
  const { po } = useLoaderData<typeof loader>();

  return (
    <s-page heading={`Purchase Order #${po.poNumber}`} sub-heading={po.supplier.name}>
      <PurchaseOrderDetail po={po} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
