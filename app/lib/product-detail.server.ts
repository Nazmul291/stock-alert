import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { getCachedSettings } from "./shop-cache.server";
import { canUseFeature } from "./plan-limits";
import { suggestReorderQuantity, getVariantLocationsForPicker, getVariantPricing, type VariantLocationLevel, type VariantPricing } from "./purchase-order.server";
import { parsePricingRuleConfig, type PricingRuleType } from "./pricing-rules.server";
import { buildTrackedProductRow } from "./products-data.server";
import { PRODUCT_INVENTORY_QUERY, PRODUCT_METAFIELDS_QUERY } from "./graphql";
import { realVariantTitle } from "./variant-display";
import type { ProductRow, VariantStatusRow } from "../components/products/ProductEditModal";
import type { PurchaseOrderStatus } from "@prisma/client";

export type ProductDetailVariantForPo = {
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  suggestedQuantity: number;
  unitCost: number | null;
  // Live from Shopify (see getVariantPricing) — null only if that lookup
  // failed, in which case the Create Purchase Order card's Price column is
  // just left blank for that variant.
  price: string | null;
  compareAtPrice: string | null;
  // One entry per *shop* location (not just ones this variant already has
  // inventory tracked at) so the Create Purchase Order card can target any
  // location as a destination — see getVariantLocationsForPicker. Empty only
  // if the live Shopify lookup itself failed, in which case the card falls
  // back to one plain quantity field per variant with no location choice.
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

export type ProductPurchaseOrderLineItemRow = {
  id: string;
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
  // Set when this line already has a fixed destination from creation time
  // (the product-detail page's per-location Create Purchase Order flow) —
  // when set, receiving shows this as plain text instead of a picker.
  locationId: string | null;
  locationName: string | null;
  // Only used (and only populated) when locationId is null — a variant
  // stocked at more than one location needs the merchant to pick which one
  // received the shipment (see receivePurchaseOrderItems for why this can't
  // be guessed).
  locations: { id: string; name: string; available: number }[];
};

export type ProductPurchaseOrderRow = {
  id: string;
  poNumber: number;
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  quantityOrdered: number;
  quantityReceived: number;
  createdAt: string;
  lineItems: ProductPurchaseOrderLineItemRow[];
};

export type ProductDetailConfigure = {
  autoHide: boolean | null;
  autoRepublish: boolean | null;
  customThreshold: string;
  customThresholdMetafieldId: string | null;
  // Per-product only — see pricing-rules.server.ts. No global/store default;
  // a product with no metafield set just has pricingRuleEnabled: false.
  pricingRuleEnabled: boolean;
  pricingRuleType: PricingRuleType;
  pricingRuleValue: string;
};

export type ProductDetailData = {
  product: ProductRow;
  configure: ProductDetailConfigure;
  storeDefaults: { threshold: number; autoHideEnabled: boolean; autoRepublishEnabled: boolean };
  canManageSupplier: boolean;
  suppliers: { id: string; name: string }[];
  variantsForPo: ProductDetailVariantForPo[];
  purchaseOrders: ProductPurchaseOrderRow[];
  history: ProductHistoryEntry[];
};

const HISTORY_LIMIT = 50;

type LiveShopifyProduct = {
  title: string;
  status: string;
  imageUrl: string | null;
  imageAlt: string | null;
  variants: { variantId: string; title: string | null; sku: string | null }[];
} | null;

// Live Shopify fetch — the sole source of a product's identity when it has
// no InventoryTracking rows yet (see the untracked-fallback branch below).
// Returns null on any GraphQL error or a genuinely nonexistent product id;
// the caller turns that into a 404.
async function fetchLiveProduct(admin: AdminApiContext, productId: string): Promise<LiveShopifyProduct> {
  const res = await admin.graphql(PRODUCT_INVENTORY_QUERY, { variables: { id: `gid://shopify/Product/${productId}` } });
  const json = (await res.json()) as {
    data?: {
      product?: {
        title: string;
        status: string;
        featuredMedia: { preview: { image: { url: string; altText: string | null } | null } | null } | null;
        variants: { edges: { node: { id: string; title: string; sku: string | null } }[] };
      } | null;
    };
    errors?: { message: string }[];
  };
  const p = json.data?.product;
  if (!p || json.errors?.length) return null;
  return {
    title: p.title,
    status: p.status,
    imageUrl: p.featuredMedia?.preview?.image?.url ?? null,
    imageAlt: p.featuredMedia?.preview?.image?.altText ?? null,
    variants: p.variants.edges.map((e) => ({
      variantId: e.node.id.split("/").pop() as string,
      title: e.node.title,
      sku: e.node.sku || null,
    })),
  };
}

// Combines a product's variant rows, supplier list, purchase orders, and its
// full activity timeline (stock alerts + PO events) for the product details
// page. Returns null only when productId doesn't resolve to a real Shopify
// product at all — a product with zero InventoryTracking rows (never
// tracked, or tracking was turned off) still renders, sourced live from
// Shopify instead of the DB, so the Configure tab can be used to start
// tracking it for the first time.
export async function getProductDetail(shop: string, productId: string, plan: string, admin: AdminApiContext): Promise<ProductDetailData | null> {
  const canManageSupplier = canUseFeature(plan, "purchaseOrders");
  let productIdBigInt: bigint;
  try {
    productIdBigInt = BigInt(productId);
  } catch {
    return null;
  }

  const [rows, settings, supplierRows, metafields] = await Promise.all([
    prisma.inventoryTracking.findMany({ where: { shop, productId: productIdBigInt } }),
    getCachedSettings(shop),
    canManageSupplier
      ? prisma.supplier.findMany({ where: { shop }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    admin.graphql(PRODUCT_METAFIELDS_QUERY, { variables: { id: `gid://shopify/Product/${productId}` } })
      .then((res) => res.json())
      .catch(() => null) as Promise<{
        data?: {
          product?: {
            customThreshold: { id: string; value: string } | null;
            autoHide: { id: string; value: string } | null;
            autoRepublish: { id: string; value: string } | null;
            pricingRule: { id: string; value: string } | null;
          } | null;
        };
      } | null>,
  ]);

  const suppliersById = new Map(supplierRows.map((s) => [s.id, s.name]));

  let product: ProductRow;
  if (rows.length > 0) {
    product = buildTrackedProductRow(productId, rows, undefined, suppliersById);
  } else {
    const live = await fetchLiveProduct(admin, productId);
    if (!live) return null;
    const variants: VariantStatusRow[] = live.variants.map((v) => ({
      id: v.variantId,
      variantId: v.variantId,
      variantTitle: v.title,
      sku: v.sku,
      currentQuantity: 0,
      inventoryStatus: "not_tracked",
    }));
    product = {
      id: productId,
      productId,
      productTitle: live.title,
      sku: variants.length === 1 ? variants[0].sku : null,
      currentQuantity: 0,
      inventoryStatus: "not_tracked",
      isHidden: false,
      isTracked: false,
      monitoringEnabled: false,
      imageUrl: live.imageUrl,
      imageAlt: live.imageAlt ?? live.title,
      shopifyStatus: live.status,
      inventoryItemId: null,
      variants,
      variantCount: variants.length,
      variantsAtRiskCount: 0,
    };
  }

  const p = metafields?.data?.product;
  const pricingRule = parsePricingRuleConfig(p?.pricingRule?.value);
  const configure: ProductDetailConfigure = {
    customThreshold: p?.customThreshold?.value ?? "",
    customThresholdMetafieldId: p?.customThreshold?.id ?? null,
    autoHide: p?.autoHide?.value !== undefined ? p.autoHide?.value === "true" : null,
    autoRepublish: p?.autoRepublish?.value !== undefined ? p.autoRepublish?.value === "true" : null,
    pricingRuleEnabled: pricingRule.enabled,
    pricingRuleType: pricingRule.type,
    pricingRuleValue: String(pricingRule.value),
  };

  const defaultLeadTime = settings?.supplierLeadTimeDays ?? 7;
  // Both best-effort and run in parallel — a Shopify API hiccup on either
  // shouldn't break the whole page (locations falls back to one plain
  // quantity field per variant with no location choice; pricing just leaves
  // the Price column blank). Skipped entirely on plans that can't manage
  // suppliers/POs — this data is never rendered there (the section shows
  // SuppliersUpsellCard instead), so there's no reason to pay for the extra
  // Shopify API round trips.
  const [locationsByVariant, pricingByVariant] = canManageSupplier && rows.length > 0
    ? await Promise.all([
        getVariantLocationsForPicker(admin, rows.map((r) => r.variantId)).catch(() => new Map<string, VariantLocationLevel[]>()),
        getVariantPricing(admin, rows.map((r) => r.variantId)).catch(() => new Map<string, VariantPricing>()),
      ])
    : [new Map<string, VariantLocationLevel[]>(), new Map<string, VariantPricing>()];
  const variantsForPo: ProductDetailVariantForPo[] = rows.map((r) => {
    // Shopify's own "Cost per item" is preferred over our InventoryTracking.unitCost
    // column, which nothing ever writes to — every PO with a cost pushes it
    // to Shopify (syncLineCostsToShopify), so Shopify's copy is the one
    // that's actually kept current, and the Create Purchase Order card's
    // Unit Cost field should default to it rather than going blank again.
    const liveUnitCost = parseFloat(pricingByVariant.get(r.variantId.toString())?.unitCost ?? "");
    return {
      variantId: r.variantId.toString(),
      variantTitle: r.variantTitle,
      // Same live-Shopify-first pattern as unitCost/price below —
      // InventoryTracking.sku is only as fresh as the last product webhook.
      sku: pricingByVariant.get(r.variantId.toString())?.sku ?? r.sku,
      currentQuantity: r.currentQuantity,
      suggestedQuantity: suggestReorderQuantity(r.currentQuantity, r.manualDailySales ?? r.avgDailySales, defaultLeadTime),
      unitCost: !isNaN(liveUnitCost) ? liveUnitCost : r.unitCost,
      price: pricingByVariant.get(r.variantId.toString())?.price ?? null,
      compareAtPrice: pricingByVariant.get(r.variantId.toString())?.compareAtPrice ?? null,
      locations: (locationsByVariant.get(r.variantId.toString()) ?? []).map((l) => ({
        locationId: l.locationId,
        locationName: l.locationName,
        available: l.available,
      })),
    };
  });

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
  // same PO produces one "PO created"/"PO received" entry, not one per line,
  // and so the PO tab's list (below) shows one row per PO too.
  const lineItemsByPo = new Map<string, typeof lineItems>();
  for (const li of lineItems) {
    const list = lineItemsByPo.get(li.purchaseOrderId);
    if (list) list.push(li); else lineItemsByPo.set(li.purchaseOrderId, [li]);
  }

  const poEvents: ProductHistoryEntry[] = [];
  const purchaseOrders: ProductPurchaseOrderRow[] = [];
  for (const [poId, items] of lineItemsByPo) {
    const po = items[0].purchaseOrder;
    const quantityOrdered = items.reduce((sum, i) => sum + i.quantityOrdered, 0);
    const quantityReceived = items.reduce((sum, i) => sum + i.quantityReceived, 0);
    const variantTitle = items.map((i) => realVariantTitle(i.variantTitle)).filter(Boolean).join(", ") || null;
    const base = {
      poId,
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

    purchaseOrders.push({
      id: poId,
      poNumber: po.poNumber,
      status: po.status,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      quantityOrdered,
      quantityReceived,
      createdAt: po.createdAt.toISOString(),
      // locationsByVariant is the same lookup already built above for
      // variantsForPo — these line items are always this product's own
      // variants, so it covers them without a second Shopify call.
      lineItems: items.map((li) => ({
        id: li.id,
        variantId: li.variantId.toString(),
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
    });
  }
  purchaseOrders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const history = [...alertEvents, ...poEvents]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, HISTORY_LIMIT);

  return {
    product,
    configure,
    storeDefaults: {
      threshold: settings?.lowStockThreshold ?? 5,
      autoHideEnabled: settings?.autoHideEnabled ?? false,
      autoRepublishEnabled: settings?.autoRepublishEnabled ?? false,
    },
    canManageSupplier,
    suppliers: supplierRows,
    variantsForPo,
    purchaseOrders,
    history,
  };
}
