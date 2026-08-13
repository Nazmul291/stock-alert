import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { sendPurchaseOrderEmail } from "../lib/notifications";
import { receivePurchaseOrderItems, getVariantLocationLevels, type VariantLocationLevel, sanitizeQuantity, sanitizeUnitCost } from "../lib/purchase-order.server";
import { PurchaseOrderDetail, type PurchaseOrderDetailData } from "../components/purchase-orders/PurchaseOrderDetail";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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

  // Only fetched once receiving is actually possible — a draft/received/
  // cancelled PO has no use for location data, so this skips the extra
  // Shopify call entirely for those.
  const canReceive = po.status === "ordered" || po.status === "partially_received";
  const locationsByVariant: Map<string, VariantLocationLevel[]> = canReceive
    ? await getVariantLocationLevels(admin, po.lineItems.map((li) => li.variantId)).catch(() => new Map())
    : new Map();

  const data: PurchaseOrderDetailData = {
    id: po.id,
    poNumber: po.poNumber,
    status: po.status,
    totalCost: po.totalCost,
    referenceNumber: po.referenceNumber,
    supplierNote: po.supplierNote,
    terms: po.terms,
    tags: po.tags,
    sentToSupplierAt: po.sentToSupplierAt?.toISOString() ?? null,
    orderedAt: po.orderedAt?.toISOString() ?? null,
    receivedAt: po.receivedAt?.toISOString() ?? null,
    createdAt: po.createdAt.toISOString(),
    supplier: {
      id: po.supplier.id,
      name: po.supplier.name,
      email: po.supplier.email,
      phone: po.supplier.phone,
      contactName: po.supplier.contactName,
      website: po.supplier.website,
      address1: po.supplier.address1,
      address2: po.supplier.address2,
      city: po.supplier.city,
      province: po.supplier.province,
      zip: po.supplier.zip,
      country: po.supplier.country,
      paymentTerms: po.supplier.paymentTerms,
      currency: po.supplier.currency,
    },
    lineItems: po.lineItems.map((li) => ({
      id: li.id,
      variantId: li.variantId.toString(),
      productTitle: li.productTitle,
      variantTitle: li.variantTitle,
      sku: li.sku,
      quantityOrdered: li.quantityOrdered,
      quantityReceived: li.quantityReceived,
      unitCost: li.unitCost,
      locationId: li.locationId,
      locationName: li.locationName,
      locations: (locationsByVariant.get(li.variantId.toString()) ?? []).map((l) => ({
        id: l.locationId,
        name: l.locationName,
        available: l.available,
      })),
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

  // Shared by update_line_items (edit-only) and order_now (edit-then-order)
  // below — both let a draft's quantities/unit costs/supplier be changed
  // right before whatever happens next. Throws on a bad supplierId so both
  // callers surface the same "Supplier not found." message.
  async function applyDraftEdits() {
    const updates = JSON.parse((form.get("lineItems") as string) ?? "[]") as { id: string; quantityOrdered: number; unitCost: number | null }[];
    const supplierId = (form.get("supplierId") as string) || null;
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, shop } });
      if (!supplier) throw new Error("Supplier not found.");
    }
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.purchaseOrderLineItem.updateMany({
            where: { id: u.id, purchaseOrderId: id },
            data: { quantityOrdered: sanitizeQuantity(u.quantityOrdered), unitCost: sanitizeUnitCost(u.unitCost) },
          }),
        ),
      );
    }
    const refreshed = await prisma.purchaseOrderLineItem.findMany({ where: { purchaseOrderId: id } });
    const totalCost = refreshed.reduce((sum, li) => sum + li.quantityOrdered * (li.unitCost ?? 0), 0);
    // Same "merchant-facing, mirrors Shopify's own create screen" fields as
    // createPurchaseOrder — editable while still a draft, same as the line
    // items and supplier above. Gated on form.has(...), not just reading with
    // a "" fallback — this same helper also backs update_line_items/order_now
    // as submitted by ManagePurchaseOrderModal.tsx (the product page's PO
    // editor), which never includes these fields at all; treating "absent"
    // the same as "submitted blank" would silently wipe out a reference
    // number/note/terms/tags set from the Purchase Orders page the moment
    // the merchant edited the same draft from the product page instead.
    const detailsPatch: { referenceNumber?: string | null; supplierNote?: string | null; terms?: string | null; tags?: string[] } = {};
    if (form.has("referenceNumber")) detailsPatch.referenceNumber = ((form.get("referenceNumber") as string) ?? "").trim() || null;
    if (form.has("supplierNote")) detailsPatch.supplierNote = ((form.get("supplierNote") as string) ?? "").trim() || null;
    if (form.has("terms")) detailsPatch.terms = ((form.get("terms") as string) ?? "").trim() || null;
    if (form.has("tags")) detailsPatch.tags = (JSON.parse((form.get("tags") as string) ?? "[]") as string[]).map((t) => t.trim()).filter(Boolean);
    await prisma.purchaseOrder.updateMany({
      where: { id, shop },
      data: { totalCost, ...detailsPatch, ...(supplierId ? { supplierId } : {}) },
    });
    return refreshed;
  }

  if (intent === "update_line_items") {
    if (po.status !== "draft") {
      return { success: false as const, error: "Only a draft purchase order can be edited." };
    }
    try {
      await applyDraftEdits();
      invalidateShopCache(shop);
      return { success: true as const, intent };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update line items.";
      return { success: false as const, error: message };
    }
  }

  // Consolidates the old two-step draft → "Send to Supplier" → "Mark as
  // Ordered" flow into one action: saves any pending edits, flips straight
  // to ordered, and fires the supplier email — same fire-and-forget pattern
  // as send_to_supplier below, just triggered from here instead of a
  // separate manual click.
  if (intent === "order_now") {
    if (po.status !== "draft") {
      return { success: false as const, error: "Only a draft purchase order can be ordered." };
    }
    try {
      const refreshed = await applyDraftEdits();
      if (refreshed.length === 0 || refreshed.every((li) => li.quantityOrdered <= 0)) {
        return { success: false as const, error: "Add at least one product with a quantity greater than zero." };
      }
      await prisma.purchaseOrder.updateMany({ where: { id, shop }, data: { status: "ordered", orderedAt: new Date() } });
      invalidateShopCache(shop);
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
      return { success: true as const, intent };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to place the order.";
      return { success: false as const, error: message };
    }
  }

  // Kept alongside order_now above — the general Purchase Orders page still
  // uses this as its own separate manual step (PurchaseOrderDetail.tsx).
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
      const receipts = JSON.parse((form.get("receipts") as string) ?? "[]") as { lineItemId: string; quantityReceived: number; locationId?: string }[];
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
