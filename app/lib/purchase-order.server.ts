import { Prisma, type PurchaseOrderStatus } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { setInventoryQuantities, activateInventoryAtLocation, getVariantInventoryItemIds, updateInventoryItemCost, updateVariantPrice } from "./shopify-inventory.server";
import { getPricingRuleConfigs, applyPricingRule } from "./pricing-rules.server";
import { storeForecastParams, computeReorderTargets, maxTriggerQuantity } from "./forecast-mode";

export type PreviewLine = {
  productId: string;
  variantId: string;
  productTitle: string | null;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  currentQuantity: number;
  stockOutDays: number | null;
  avgDailySales: number | null;
  manualDailySales: number | null;
  unitCost: number | null;
  price: string | null;
  compareAtPrice: string | null;
  suggestedQuantity: number;
};

export type SupplierPreview = {
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  lines: PreviewLine[];
};

// (suggestReorderQuantity used to live here. It's been replaced by
// computeReorderTargets in forecast-mode.ts, which produces the identical
// result for the default "smart" mode with safetyStockDays 0, but also
// handles the fixed-stock-level basis that "classic" mode needs — its
// `avgDailySales <= 0 → 0` guard made it structurally unable to suggest a
// quantity for a product with no sales history. Deleted rather than kept
// alongside, so there's exactly one place reorder math lives.)

// Floors a client-submitted quantity to a safe non-negative integer.
// PurchaseOrderLineItem.quantityOrdered is an Int column — a fractional
// value (e.g. 2.7, from a hand-crafted request bypassing the UI's number
// input) would otherwise reach Prisma and throw a raw validation error
// mid-transaction instead of degrading to a clean, predictable quantity.
export function sanitizeQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

// Rejects a client-submitted unit cost that isn't a finite, non-negative
// number, falling back to null (the caller then falls back further to the
// product's own catalog cost) rather than persisting a negative/NaN cost
// that would silently corrupt totalCost and get emailed to the supplier.
export function sanitizeUnitCost(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

// Groups a shop's at-risk InventoryTracking rows by their assigned supplier,
// using each supplier's own leadTimeDays (falling back to the shop's global
// StoreSettings.supplierLeadTimeDays) as the "at risk" cutoff. Does not
// persist anything — this is a preview for the merchant to review/edit
// before generatePurchaseOrder() actually creates a PO.
export async function previewPurchaseOrders(shop: string, supplierIds?: string[]): Promise<SupplierPreview[]> {
  const settingsRow = await prisma.storeSettings.findUnique({ where: { shop } });
  const effectiveThreshold = settingsRow?.lowStockThreshold ?? 5;
  const forecastParams = storeForecastParams({
    forecastMode: settingsRow?.forecastMode ?? "smart",
    supplierLeadTimeDays: settingsRow?.supplierLeadTimeDays ?? 7,
    safetyStockDays: settingsRow?.safetyStockDays ?? 0,
    minStockLevel: settingsRow?.minStockLevel ?? null,
  });
  // Widest quantity that could trigger a reorder under these params — lets
  // the SQL below prefilter without needing to express per-row forecast
  // resolution in SQL. Deliberately over-selects: a row wrongly excluded
  // here can never be recovered by the exact per-row check in the loop.
  const maxQty = maxTriggerQuantity(forecastParams, effectiveThreshold);

  const [suppliers, rows] = await Promise.all([
    prisma.supplier.findMany({
      where: { shop, ...(supplierIds ? { id: { in: supplierIds } } : {}) },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryTracking.findMany({
      where: {
        shop,
        supplierId: { not: null, ...(supplierIds ? { in: supplierIds } : {}) },
        monitoringEnabled: true,
        // stockOutDays is null whenever there's no recent (30-day) sales to
        // compute a rate from (computeStockOutDays, velocity.server.ts) —
        // which is exactly the situation a product that's already out of
        // stock is most likely to be in (it can't sell what it doesn't
        // have). Without the currentQuantity branch, the products a
        // merchant most needs to see here were the ones most likely to be
        // silently excluded. The third branch is what makes "classic" mode
        // work at all: a fixed reorder point triggers on quantity alone,
        // with no velocity and no stockOutDays involved.
        OR: [
          { stockOutDays: { not: null } },
          { currentQuantity: { lte: 0 } },
          ...(maxQty !== null ? [{ currentQuantity: { lte: maxQty } }] : []),
        ],
      },
    }),
  ]);

  const defaultLeadTime = settingsRow?.supplierLeadTimeDays ?? 7;
  const suppliersById = new Map(suppliers.map((s) => [s.id, s]));

  const bySupplier = new Map<string, PreviewLine[]>();
  for (const row of rows) {
    const supplierId = row.supplierId as string;
    const supplier = suppliersById.get(supplierId);
    if (!supplier) continue; // filtered out by supplierIds, or deleted between queries

    // Supplier's own lead time still wins over the store default — that's
    // per-supplier data the forecast mode doesn't override.
    const leadTimeDays = supplier.leadTimeDays ?? defaultLeadTime;
    const targets = computeReorderTargets(
      { ...forecastParams, leadTimeDays },
      {
        currentQuantity: row.currentQuantity,
        // avgDailySales only, deliberately — NOT `manualDailySales ??
        // avgDailySales`. stockOutDays is itself computed from avgDailySales
        // alone (velocity.server.ts), so mixing a manual rate in here would
        // compare a manual-rate quantity against a market-rate runway. The
        // preview still *displays* manualDailySales; that display-vs-compute
        // split predates this change and is left as-is rather than silently
        // altering existing suggestions.
        avgDailySales: row.avgDailySales,
        stockOutDays: row.stockOutDays,
        effectiveThreshold,
      },
    );
    if (!targets.shouldReorder) continue;

    const line: PreviewLine = {
      productId: row.productId.toString(),
      variantId: row.variantId.toString(),
      productTitle: row.productTitle,
      variantTitle: row.variantTitle,
      sku: row.sku,
      imageUrl: row.imageUrl,
      imageAlt: row.imageAlt,
      currentQuantity: row.currentQuantity,
      stockOutDays: row.stockOutDays,
      avgDailySales: row.avgDailySales,
      manualDailySales: row.manualDailySales,
      unitCost: row.unitCost,
      price: null,
      compareAtPrice: null,
      suggestedQuantity: targets.suggestedQuantity,
    };
    const list = bySupplier.get(supplierId);
    if (list) list.push(line); else bySupplier.set(supplierId, [line]);
  }

  return Array.from(bySupplier.entries()).map(([supplierId, lines]) => {
    const supplier = suppliersById.get(supplierId)!;
    return {
      supplierId,
      supplierName: supplier.name,
      leadTimeDays: supplier.leadTimeDays ?? defaultLeadTime,
      lines,
    };
  });
}

async function nextPoNumber(tx: Prisma.TransactionClient, shop: string): Promise<number> {
  const max = await tx.purchaseOrder.aggregate({ where: { shop }, _max: { poNumber: true } });
  return (max._max.poNumber ?? 0) + 1;
}

export type ProductPickerRow = {
  productId: string;
  variantId: string;
  productTitle: string | null;
  variantTitle: string | null;
  sku: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  currentQuantity: number;
  stockOutDays: number | null;
  avgDailySales: number | null;
  unitCost: number | null;
  price: string | null;
  compareAtPrice: string | null;
  supplierId: string | null;
  suggestedQuantity: number;
};

// Any tracked product, independent of supplier assignment or at-risk status —
// the manual "search & add" side of PO creation. Forecast data is still
// attached (via the shop's forecast mode against its default lead time) so a
// manually-added line still gets a sane default quantity, but nothing here
// gates which products are searchable — unlike previewPurchaseOrders, a row
// is returned whether or not it's actually due for reorder, so
// shouldReorder is deliberately ignored and only the quantity is used.
export async function searchTrackedProducts(shop: string, opts: { search?: string; limit?: number } = {}): Promise<ProductPickerRow[]> {
  const search = (opts.search ?? "").trim();
  const limit = opts.limit ?? 25;

  const [settings, rows] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.inventoryTracking.findMany({
      where: {
        shop,
        ...(search
          ? {
              OR: [
                { productTitle: { contains: search, mode: "insensitive" } },
                { sku: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      take: limit,
      orderBy: { productTitle: "asc" },
    }),
  ]);

  const defaultLeadTime = settings?.supplierLeadTimeDays ?? 7;
  const effectiveThreshold = settings?.lowStockThreshold ?? 5;
  const forecastParams = storeForecastParams({
    forecastMode: settings?.forecastMode ?? "smart",
    supplierLeadTimeDays: defaultLeadTime,
    safetyStockDays: settings?.safetyStockDays ?? 0,
    minStockLevel: settings?.minStockLevel ?? null,
  });

  return rows.map((row) => ({
    productId: row.productId.toString(),
    variantId: row.variantId.toString(),
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    sku: row.sku,
    imageUrl: row.imageUrl,
    imageAlt: row.imageAlt,
    currentQuantity: row.currentQuantity,
    stockOutDays: row.stockOutDays,
    avgDailySales: row.avgDailySales,
    unitCost: row.unitCost,
    price: null,
    compareAtPrice: null,
    supplierId: row.supplierId,
    suggestedQuantity: computeReorderTargets(forecastParams, {
      currentQuantity: row.currentQuantity,
      avgDailySales: row.avgDailySales,
      stockOutDays: row.stockOutDays,
      effectiveThreshold,
    }).suggestedQuantity,
  }));
}

export type CreatePurchaseOrderLine = {
  variantId: string;
  quantityOrdered: number;
  unitCost?: number | null;
  // Merchant-supplied override for a variant with no SKU tracked yet — falls
  // back to InventoryTracking.sku (see resolvedLines below) when left blank,
  // never the other way around, so this can't blank out a real synced SKU.
  sku?: string | null;
  // Destination location for this line — only ever sent by the
  // product-detail page's Create Purchase Order flow, which asks for one
  // location for the whole PO and stamps it onto every included line.
  // Omitted (or null) by the general Purchase Orders page, which has no
  // location concept and keeps creating one location-less line per variant.
  locationId?: string | null;
  locationName?: string | null;
};

// Persists a PurchaseOrder from merchant-approved line items — forecast
// suggestions (previewPurchaseOrders) or manual search (searchTrackedProducts)
// both just feed this the same shape, so neither is a hard requirement to
// create a PO. Re-derives product/variant title, SKU, and a unitCost fallback
// from the DB rather than trusting whatever the client displayed, and keeps
// the poNumber transaction + P2002 collision retry from the previous
// forecast-only implementation.
//
// `admin` is only required when at least one line carries a locationId — it's
// used to verify that id is actually a real location for that variant before
// persisting (a client-supplied locationId isn't trustworthy on its own,
// same reasoning as the supplierId check below). The general PO flow never
// sends a locationId, so it never pays for this extra Shopify call.
export type CreatedPurchaseOrderLine = {
  id: string;
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | null;
  locationId: string | null;
  locationName: string | null;
};

export type CreatedPurchaseOrder = {
  purchaseOrderId: string;
  poNumber: number;
  createdAt: string;
  supplierName: string;
  referenceNumber: string | null;
  supplierNote: string | null;
  terms: string | null;
  tags: string[];
  lineItems: CreatedPurchaseOrderLine[];
  // Non-fatal — the PO itself is already created by the time this is set,
  // so a Shopify cost-sync hiccup surfaces as a warning, not a failure.
  costSyncWarning: string | null;
};

// Merchant-facing fields mirroring Shopify's own native "Create purchase
// order" screen — see the matching comment on the Prisma model. All optional;
// `terms` falls back to the supplier's own paymentTerms when left blank.
export type CreatePurchaseOrderDetails = {
  referenceNumber?: string | null;
  supplierNote?: string | null;
  terms?: string | null;
  tags?: string[];
};

// Pushes each line's unit cost to Shopify's own "Cost per item" field on the
// variant, so placing a PO with a cost actually updates the product — not
// just our own PurchaseOrderLineItem row. Also sets the variant's selling
// price using that product's own pricing rule (see pricing-rules.server.ts
// — a per-product opt-in, configured on the product detail page's Configure
// card, not a store-wide default): once enabled, it's enforced on every PO
// with a unit cost, unconditionally overwriting whatever price Shopify
// currently has — not just when the price happens to be $0. Does nothing at
// all for a product with no pricing rule enabled. Returns a human-readable
// warning string (never throws) so a Shopify hiccup here doesn't undo the
// already-committed PO; the caller surfaces it alongside the success result.
async function syncLineCostsToShopify(
  admin: AdminApiContext,
  lineItems: { productId: bigint; variantId: bigint; unitCost: number | null; productTitle: string | null; sku: string | null }[],
): Promise<string | null> {
  const costedLines = lineItems.filter((li) => li.unitCost != null);
  if (costedLines.length === 0) return null;

  try {
    const variantIds = costedLines.map((li) => li.variantId);
    const productIds = [...new Set(costedLines.map((li) => li.productId))];
    const [inventoryItemIds, pricingRules] = await Promise.all([
      getVariantInventoryItemIds(admin, variantIds),
      getPricingRuleConfigs(admin, productIds),
    ]);
    const failures: string[] = [];
    for (const li of costedLines) {
      const inventoryItemId = inventoryItemIds.get(li.variantId.toString());
      const label = li.productTitle ?? li.sku ?? li.variantId.toString();
      if (!inventoryItemId) {
        failures.push(label);
        continue;
      }
      const { userErrors } = await updateInventoryItemCost(admin, inventoryItemId, li.unitCost!);
      if (userErrors.length > 0) {
        failures.push(`${label} (${userErrors.join(", ")})`);
        continue;
      }

      const rule = pricingRules.get(li.productId.toString());
      if (rule?.enabled) {
        const newPrice = applyPricingRule(rule, li.unitCost!);
        const { userErrors: priceErrors } = await updateVariantPrice(admin, li.productId.toString(), li.variantId.toString(), newPrice);
        if (priceErrors.length > 0) failures.push(`${label} price (${priceErrors.join(", ")})`);
      }
    }
    if (failures.length === 0) return null;
    return `Purchase order created, but Shopify wasn't fully updated for: ${failures.join("; ")}.`;
  } catch (err) {
    return `Purchase order created, but syncing cost/price to Shopify failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function createPurchaseOrder(
  shop: string,
  supplierId: string,
  lines: CreatePurchaseOrderLine[],
  admin?: AdminApiContext,
  details?: CreatePurchaseOrderDetails,
): Promise<CreatedPurchaseOrder> {
  const sanitizedLines = lines.map((l) => ({
    ...l,
    quantityOrdered: sanitizeQuantity(l.quantityOrdered),
    unitCost: sanitizeUnitCost(l.unitCost),
  }));
  const positiveLines = sanitizedLines.filter((l) => l.quantityOrdered > 0);
  if (positiveLines.length === 0) {
    throw new Error("Add at least one product with a quantity greater than zero.");
  }

  // Unlike the old forecast-only generatePurchaseOrder (which only ever saw
  // supplier IDs that previewPurchaseOrders itself had already scoped to
  // `shop`), supplierId here comes straight from the client — verify it's
  // actually this shop's supplier before attaching it to a new PO.
  const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, shop } });
  if (!supplier) {
    throw new Error("Supplier not found.");
  }

  const variantIds = positiveLines.map((l) => BigInt(l.variantId));
  const rows = await prisma.inventoryTracking.findMany({ where: { shop, variantId: { in: variantIds } } });
  const rowsByVariantId = new Map(rows.map((r) => [r.variantId.toString(), r]));

  const linesWithLocation = positiveLines.filter((l) => l.locationId);
  if (linesWithLocation.length > 0) {
    if (!admin) throw new Error("Cannot assign a location without an active Shopify session.");
    // Validated against the shop's real locations, not each variant's
    // already-activated ones — a PO is allowed to target a location a
    // variant isn't stocked at yet; receivePurchaseOrderItems activates it
    // in Shopify the first time stock is actually received there.
    const shopLocations = await getShopLocations(admin);
    const validLocationIds = new Set(shopLocations.map((loc) => loc.id));
    for (const l of linesWithLocation) {
      if (!validLocationIds.has(l.locationId!)) {
        throw new Error(`"${l.locationName ?? l.locationId}" is not a valid location for this store — refresh and try again.`);
      }
    }
  }

  const resolvedLines = positiveLines
    .map((l) => {
      const row = rowsByVariantId.get(l.variantId);
      if (!row) return null;
      return {
        productId: row.productId,
        variantId: BigInt(l.variantId),
        productTitle: row.productTitle,
        variantTitle: row.variantTitle,
        sku: l.sku?.trim() || row.sku,
        quantityOrdered: l.quantityOrdered,
        unitCost: l.unitCost ?? row.unitCost ?? null,
        locationId: l.locationId ?? null,
        locationName: l.locationName ?? null,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (resolvedLines.length === 0) {
    throw new Error("None of the selected products could be found.");
  }

  const totalCost = resolvedLines.reduce((sum, l) => sum + l.quantityOrdered * (l.unitCost ?? 0), 0);
  const referenceNumber = details?.referenceNumber?.trim() || null;
  const supplierNote = details?.supplierNote?.trim() || null;
  // Falls back to the supplier's own paymentTerms, same as Shopify's own
  // supplier form promising this ("This will auto populate the payment
  // information on the purchase order.") — still fully editable per-PO.
  const terms = details?.terms?.trim() || supplier.paymentTerms || null;
  const tags = (details?.tags ?? []).map((t) => t.trim()).filter(Boolean);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const purchaseOrder = await prisma.$transaction(async (tx) => {
        const poNumber = await nextPoNumber(tx, shop);
        return tx.purchaseOrder.create({
          data: {
            shop,
            supplierId,
            poNumber,
            totalCost,
            generatedFromForecast: false,
            referenceNumber,
            supplierNote,
            terms,
            tags,
            lineItems: { create: resolvedLines },
          },
          include: { lineItems: true },
        });
      });

      // Best-effort — the PO is already committed above, so a cost-sync
      // failure here is reported back as a warning rather than rolling back
      // or failing the whole creation. Only attempted for lines the merchant
      // actually gave a cost for, and only when there's a live Shopify
      // session to push it through.
      const costSyncWarning = admin ? await syncLineCostsToShopify(admin, purchaseOrder.lineItems) : null;

      return {
        purchaseOrderId: purchaseOrder.id,
        poNumber: purchaseOrder.poNumber,
        createdAt: purchaseOrder.createdAt.toISOString(),
        supplierName: supplier.name,
        referenceNumber: purchaseOrder.referenceNumber,
        supplierNote: purchaseOrder.supplierNote,
        terms: purchaseOrder.terms,
        tags: purchaseOrder.tags,
        lineItems: purchaseOrder.lineItems.map((li) => ({
          id: li.id,
          variantId: li.variantId.toString(),
          variantTitle: li.variantTitle,
          sku: li.sku,
          quantityOrdered: li.quantityOrdered,
          quantityReceived: li.quantityReceived,
          unitCost: li.unitCost,
          locationId: li.locationId,
          locationName: li.locationName,
        })),
        costSyncWarning,
      };
    } catch (err) {
      const isPoNumberCollision = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (isPoNumberCollision && attempt === 0) continue;
      throw err;
    }
  }

  // Unreachable — the loop above either returns or throws.
  throw new Error("Failed to create purchase order.");
}

export function nextStatus(lineItems: { quantityOrdered: number; quantityReceived: number }[]): PurchaseOrderStatus {
  return lineItems.every((li) => li.quantityReceived >= li.quantityOrdered) ? "received" : "partially_received";
}

// Batched lookup — one call for every variant instead of one per line item,
// using Shopify's nodes(ids:) so the loader can show a location picker up
// front for multi-location variants, and receivePurchaseOrderItems can
// resolve+validate every receipt's chosen location in a single round trip.
const VARIANT_LOCATIONS_QUERY = `
  query getVariantLocations($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryItem {
          id
          inventoryLevels(first: 50) {
            edges {
              node {
                location { id name }
                quantities(names: ["available"]) { quantity }
              }
            }
          }
        }
      }
    }
  }
`;

type VariantLocationsResponse = {
  data?: {
    nodes: Array<{
      id?: string;
      inventoryItem?: {
        id: string;
        inventoryLevels: { edges: Array<{ node: { location: { id: string; name: string }; quantities: Array<{ quantity: number }> } }> };
      } | null;
    } | null>;
  };
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
  errors?: Array<{ message: string }>;
};

export type VariantLocationLevel = { inventoryItemId: string; locationId: string; locationName: string; available: number };

// Keyed by variant id (as a plain string, matching InventoryTracking's
// variantId.toString() convention elsewhere in this file).
export async function getVariantLocationLevels(
  admin: AdminApiContext,
  variantIds: bigint[],
): Promise<Map<string, VariantLocationLevel[]>> {
  const map = new Map<string, VariantLocationLevel[]>();
  if (variantIds.length === 0) return map;

  const ids = variantIds.map((id) => `gid://shopify/ProductVariant/${id.toString()}`);
  const res = await admin.graphql(VARIANT_LOCATIONS_QUERY, { variables: { ids } });
  const json: VariantLocationsResponse = await res.json();
  if (json.errors?.length) throw new Error(`Failed to look up inventory locations: ${json.errors.map((e) => e.message).join("; ")}`);

  for (const node of json.data?.nodes ?? []) {
    if (!node?.id || !node.inventoryItem) continue;
    const variantId = node.id.split("/").pop() as string;
    const levels = node.inventoryItem.inventoryLevels.edges.map((e) => ({
      inventoryItemId: node.inventoryItem!.id,
      locationId: e.node.location.id,
      locationName: e.node.location.name,
      available: e.node.quantities[0]?.quantity ?? 0,
    }));
    map.set(variantId, levels);
  }
  return map;
}

export type ShopLocation = { id: string; name: string };

const SHOP_LOCATIONS_QUERY = `
  query getShopLocations {
    locations(first: 50, sortKey: NAME) {
      edges { node { id name } }
    }
  }
`;

// Every location in the shop, regardless of whether any given variant is
// stocked there yet — getVariantLocationLevels only reports locations
// Shopify already has inventory levels for, which hides locations a
// merchant hasn't activated a product at but still wants to order stock for.
export async function getShopLocations(admin: AdminApiContext): Promise<ShopLocation[]> {
  const res = await admin.graphql(SHOP_LOCATIONS_QUERY);
  const json: { data?: { locations?: { edges: Array<{ node: { id: string; name: string } }> } } } = await res.json();
  return (json.data?.locations?.edges ?? []).map((e) => e.node);
}

// Feeds the product-detail Create Purchase Order card and the PO-receiving
// location pickers: one entry per *shop* location for every variant (not
// just locations that variant already has inventory tracked at), with
// `available` filled in from real inventory levels where they exist, or 0
// where the variant isn't activated there yet. This is what lets a merchant
// target any of their locations as a PO's destination — receivePurchaseOrderItems
// activates it in Shopify automatically the first time stock is received there.
export async function getVariantLocationsForPicker(
  admin: AdminApiContext,
  variantIds: bigint[],
): Promise<Map<string, VariantLocationLevel[]>> {
  const map = new Map<string, VariantLocationLevel[]>();
  if (variantIds.length === 0) return map;

  const [shopLocations, activatedByVariant] = await Promise.all([
    getShopLocations(admin),
    getVariantLocationLevels(admin, variantIds),
  ]);

  for (const id of variantIds) {
    const key = id.toString();
    const activated = activatedByVariant.get(key) ?? [];
    map.set(
      key,
      shopLocations.map((loc) => {
        const match = activated.find((a) => a.locationId === loc.id);
        return {
          inventoryItemId: match?.inventoryItemId ?? "",
          locationId: loc.id,
          locationName: loc.name,
          available: match?.available ?? 0,
        };
      }),
    );
  }
  return map;
}

export type VariantPricing = { sku: string | null; price: string | null; compareAtPrice: string | null; unitCost: string | null };

const VARIANT_PRICING_QUERY = `
  query getVariantPricing($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        sku
        price
        compareAtPrice
        inventoryItem {
          unitCost { amount }
        }
      }
    }
  }
`;

// Feeds the Price column on the product-detail Create Purchase Order card —
// merchants ordering stock want to see what the item actually sells for
// (and whether it's currently marked down) alongside the cost they're
// paying the supplier for it. unitCost is Shopify's own live "Cost per
// item" — the same field syncLineCostsToShopify pushes to on every PO — so
// it's used as the Unit Cost field's starting value too, instead of our own
// InventoryTracking.unitCost column, which nothing ever writes to. sku is
// fetched live for the same reason — InventoryTracking.sku is only as fresh
// as the last product webhook, and a PO's SKU field should default to
// whatever Shopify actually has right now, not a possibly-stale copy.
export async function getVariantPricing(admin: AdminApiContext, variantIds: bigint[]): Promise<Map<string, VariantPricing>> {
  const map = new Map<string, VariantPricing>();
  if (variantIds.length === 0) return map;

  const ids = variantIds.map((id) => `gid://shopify/ProductVariant/${id.toString()}`);
  const res = await admin.graphql(VARIANT_PRICING_QUERY, { variables: { ids } });
  const json: { data?: { nodes: Array<{ id?: string; sku?: string | null; price?: string | null; compareAtPrice?: string | null; inventoryItem?: { unitCost: { amount: string } | null } | null } | null> } } = await res.json();
  for (const node of json.data?.nodes ?? []) {
    if (!node?.id) continue;
    const variantId = node.id.split("/").pop() as string;
    map.set(variantId, { sku: node.sku ?? null, price: node.price ?? null, compareAtPrice: node.compareAtPrice ?? null, unitCost: node.inventoryItem?.unitCost?.amount ?? null });
  }
  return map;
}

// Overlays Shopify's live SKU, "Cost per item", selling price, and
// compare-at price onto rows sourced from InventoryTracking (whose own
// unitCost column nothing ever writes to — every PO with a cost pushes it to
// Shopify instead, see syncLineCostsToShopify — and which never carried
// price at all; sku is only as fresh as the last product webhook). Used by
// both the product-detail page and the general Purchase Orders picker, so
// their SKU, Unit Cost, and Price columns default to whatever Shopify
// actually has right now instead of a possibly-stale synced copy.
export async function withLiveUnitCost<T extends { variantId: string; sku: string | null; unitCost: number | null; price: string | null; compareAtPrice: string | null }>(
  admin: AdminApiContext,
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const pricing = await getVariantPricing(admin, rows.map((r) => BigInt(r.variantId))).catch(() => new Map<string, VariantPricing>());
  return rows.map((r) => {
    const live = pricing.get(r.variantId);
    const liveCost = parseFloat(live?.unitCost ?? "");
    return {
      ...r,
      sku: live?.sku ?? r.sku,
      unitCost: isNaN(liveCost) ? r.unitCost : liveCost,
      price: live?.price ?? r.price,
      compareAtPrice: live?.compareAtPrice ?? r.compareAtPrice,
    };
  });
}

// Receives quantities against an ordered/partially_received PO. Pushes the
// new absolute quantity to Shopify's location for each variant *before*
// touching the DB — if that call fails, nothing is recorded as received.
// Deliberately does not write InventoryTracking.currentQuantity directly:
// app.products.tsx documents that the inventory webhook is the sole source
// of truth for quantity/status, so this goes through Shopify the same way
// every other quantity change does, and lets webhooks.inventory.tsx pick up
// the resulting inventory_levels/update event.
// A variant stocked at more than one location has no way to know which
// location a shipment actually arrived at, so the caller (PurchaseOrderDetail's
// location picker, fed by the loader's getVariantLocationsForPicker call) must
// supply locationId explicitly for those — this only guesses "the" location
// when there's exactly one to guess. Never silently picks one out of several
// (e.g. "whichever location Shopify returns first"), which could credit the
// wrong warehouse. The chosen (or preset) location doesn't need to already
// be stocked — it's activated in Shopify on the fly if it isn't yet, since
// the picker now offers every shop location, not just ones already tracked.
export async function receivePurchaseOrderItems(
  shop: string,
  purchaseOrderId: string,
  receipts: { lineItemId: string; quantityReceived: number; locationId?: string }[],
  admin: AdminApiContext,
): Promise<{ status: PurchaseOrderStatus }> {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, shop },
    include: { lineItems: true },
  });
  if (!po) throw new Error("Purchase order not found.");
  if (po.status !== "ordered" && po.status !== "partially_received") {
    throw new Error("This purchase order is not awaiting receipt.");
  }

  const lineItemsById = new Map(po.lineItems.map((li) => [li.id, li]));
  const validReceipts = receipts
    .map((r) => {
      const line = lineItemsById.get(r.lineItemId);
      if (!line) return null;
      const remaining = line.quantityOrdered - line.quantityReceived;
      const quantityReceived = Math.max(0, Math.min(r.quantityReceived, remaining));
      return quantityReceived > 0 ? { line, quantityReceived, locationId: r.locationId } : null;
    })
    .filter((x): x is { line: (typeof po.lineItems)[number]; quantityReceived: number; locationId: string | undefined } => x !== null);

  if (validReceipts.length === 0) {
    throw new Error("No valid quantities to receive.");
  }

  const levelsByVariant = await getVariantLocationLevels(admin, validReceipts.map((r) => r.line.variantId));

  const quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number; changeFromQuantity: null }> = [];
  for (const { line, quantityReceived, locationId: receiptLocationId } of validReceipts) {
    const levels = levelsByVariant.get(line.variantId.toString()) ?? [];
    // Preset locationId from creation time (the product-detail Create PO
    // flow) wins over one picked now during receiving — same precedence as
    // before this locationId could target an unactivated location.
    const targetLocationId = line.locationId ?? receiptLocationId ?? null;
    const existing = targetLocationId ? levels.find((l) => l.locationId === targetLocationId) : undefined;

    let level: VariantLocationLevel;
    if (existing) {
      level = existing;
    } else if (targetLocationId) {
      // Either this line was created for a location the variant wasn't
      // activated at yet, or the merchant just picked one while receiving
      // that it isn't stocked at — activate it in Shopify instead of
      // failing (inventorySetQuantities requires activation first).
      const inventoryItemId = levels[0]?.inventoryItemId;
      if (!inventoryItemId) {
        throw new Error(`Could not find inventory item for ${line.productTitle ?? line.sku}.`);
      }
      const { userErrors: activateErrors } = await activateInventoryAtLocation(admin, inventoryItemId, targetLocationId);
      if (activateErrors.length > 0) {
        throw new Error(`${line.productTitle ?? line.sku}: couldn't activate "${line.locationName ?? targetLocationId}" — ${activateErrors.join(", ")}`);
      }
      level = { inventoryItemId, locationId: targetLocationId, locationName: line.locationName ?? targetLocationId, available: 0 };
    } else if (levels.length === 1) {
      level = levels[0];
    } else if (levels.length === 0) {
      throw new Error(`Could not find inventory location for ${line.productTitle ?? line.sku}.`);
    } else {
      throw new Error(`${line.productTitle ?? line.sku} is stocked at ${levels.length} locations — choose which location received this shipment.`);
    }

    quantities.push({
      inventoryItemId: level.inventoryItemId,
      locationId: level.locationId,
      quantity: level.available + quantityReceived,
      changeFromQuantity: null,
    });
  }

  const { userErrors: invErrs } = await setInventoryQuantities(admin, quantities, "received");
  if (invErrs.length > 0) throw new Error(invErrs.join(", "));

  const status = await prisma.$transaction(async (tx) => {
    for (const { line, quantityReceived } of validReceipts) {
      await tx.purchaseOrderLineItem.update({
        where: { id: line.id },
        data: { quantityReceived: { increment: quantityReceived } },
      });
    }
    const refreshedLines = await tx.purchaseOrderLineItem.findMany({ where: { purchaseOrderId } });
    const status = nextStatus(refreshedLines);
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status, ...(status === "received" ? { receivedAt: new Date() } : {}) },
    });
    return status;
  });

  return { status };
}
