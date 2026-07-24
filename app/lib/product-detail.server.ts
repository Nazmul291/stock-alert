import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { canUseFeature } from "./plan-limits";
import { suggestReorderQuantity, getVariantLocationLevels, type VariantLocationLevel } from "./purchase-order.server";
import { buildTrackedProductRow } from "./products-data.server";
import type { ProductRow } from "../components/products/ProductEditModal";
import type { PurchaseOrderStatus } from "@prisma/client";

export type ProductDetailVariantForPo = {
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  suggestedQuantity: number;
  unitCost: number | null;
  // Empty when the product has a single location (or the live Shopify lookup
  // failed) — the Create Purchase Order card falls back to one quantity
  // field per variant in that case, same as before this field existed.
  locations: { locationId: string; locationName: string; available: number }[];
};

export type ProductHistoryEntry =
  | {
      type: "alert";
      at: string;
      alertType: string | null;
      quantityAtAlert: number | null;
      variantTitle: string | null;
    }
  | {
      type: "po";
      at: string;
      event: "created" | "sent" | "ordered" | "received";
      poId: string;
      poNumber: number;
      status: PurchaseOrderStatus;
      supplierName: string;
      quantityOrdered: number;
      quantityReceived: number;
      variantTitle: string | null;
    };

export type ProductDetailData = {
  product: ProductRow;
  canManageSupplier: boolean;
  suppliers: { id: string; name: string }[];
  variantsForPo: ProductDetailVariantForPo[];
  history: ProductHistoryEntry[];
};

const HISTORY_LIMIT = 50;

// Combines a product's variant rows, supplier list, and its full activity
// timeline (stock alerts + purchase order events) for the product details
// page. Returns null when nothing is tracked for this productId — the route
// turns that into a 404 rather than rendering an empty page.
export async function getProductDetail(shop: string, productId: string, plan: string, admin: AdminApiContext): Promise<ProductDetailData | null> {
  const canManageSupplier = canUseFeature(plan, "purchaseOrders");
  let productIdBigInt: bigint;
  try {
    productIdBigInt = BigInt(productId);
  } catch {
    return null;
  }

  const [rows, settings, supplierRows] = await Promise.all([
    prisma.inventoryTracking.findMany({ where: { shop, productId: productIdBigInt } }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    canManageSupplier
      ? prisma.supplier.findMany({ where: { shop }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  if (rows.length === 0) return null;

  const suppliersById = new Map(supplierRows.map((s) => [s.id, s.name]));
  const product = buildTrackedProductRow(productId, rows, undefined, suppliersById);

  const defaultLeadTime = settings?.supplierLeadTimeDays ?? 7;
  // Best-effort — a Shopify API hiccup here shouldn't break the whole page,
  // it just means the Create Purchase Order card falls back to one combined
  // quantity field per variant instead of one per location (same defensive
  // pattern app.purchase-orders.$id.tsx uses around this same call).
  const locationsByVariant = await getVariantLocationLevels(admin, rows.map((r) => r.variantId)).catch(() => new Map<string, VariantLocationLevel[]>());
  const variantsForPo: ProductDetailVariantForPo[] = rows.map((r) => ({
    variantId: r.variantId.toString(),
    variantTitle: r.variantTitle,
    sku: r.sku,
    currentQuantity: r.currentQuantity,
    suggestedQuantity: suggestReorderQuantity(r.currentQuantity, r.manualDailySales ?? r.avgDailySales, defaultLeadTime),
    unitCost: r.unitCost,
    locations: (locationsByVariant.get(r.variantId.toString()) ?? []).map((l) => ({
      locationId: l.locationId,
      locationName: l.locationName,
      available: l.available,
    })),
  }));

  const [alerts, lineItems] = await Promise.all([
    prisma.alertHistory.findMany({
      where: { shop, productId: productIdBigInt },
      orderBy: { sentAt: "desc" },
      take: HISTORY_LIMIT,
    }),
    prisma.purchaseOrderLineItem.findMany({
      where: { productId: productIdBigInt, purchaseOrder: { shop } },
      include: { purchaseOrder: { include: { supplier: true } } },
    }),
  ]);

  const alertEvents: ProductHistoryEntry[] = alerts.map((a) => ({
    type: "alert",
    at: a.sentAt.toISOString(),
    alertType: a.alertType,
    quantityAtAlert: a.quantityAtAlert,
    variantTitle: a.variantTitle,
  }));

  // PO timestamps (createdAt/sentToSupplierAt/orderedAt/receivedAt) live on
  // the parent PurchaseOrder, not the line item — group this product's line
  // items by PO first so a multi-variant product with several lines on the
  // same PO produces one "PO created"/"PO received" entry, not one per line.
  const lineItemsByPo = new Map<string, typeof lineItems>();
  for (const li of lineItems) {
    const list = lineItemsByPo.get(li.purchaseOrderId);
    if (list) list.push(li); else lineItemsByPo.set(li.purchaseOrderId, [li]);
  }

  const poEvents: ProductHistoryEntry[] = [];
  for (const items of lineItemsByPo.values()) {
    const po = items[0].purchaseOrder;
    const quantityOrdered = items.reduce((sum, i) => sum + i.quantityOrdered, 0);
    const quantityReceived = items.reduce((sum, i) => sum + i.quantityReceived, 0);
    const variantTitle = items.map((i) => i.variantTitle).filter(Boolean).join(", ") || null;
    const base = {
      poId: po.id,
      poNumber: po.poNumber,
      status: po.status,
      supplierName: po.supplier.name,
      quantityOrdered,
      quantityReceived,
      variantTitle,
    };
    poEvents.push({ type: "po", event: "created", at: po.createdAt.toISOString(), ...base });
    if (po.sentToSupplierAt) poEvents.push({ type: "po", event: "sent", at: po.sentToSupplierAt.toISOString(), ...base });
    if (po.orderedAt) poEvents.push({ type: "po", event: "ordered", at: po.orderedAt.toISOString(), ...base });
    if (po.receivedAt) poEvents.push({ type: "po", event: "received", at: po.receivedAt.toISOString(), ...base });
  }

  const history = [...alertEvents, ...poEvents]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, HISTORY_LIMIT);

  return {
    product,
    canManageSupplier,
    suppliers: supplierRows,
    variantsForPo,
    history,
  };
}
