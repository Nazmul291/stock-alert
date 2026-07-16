import { Prisma, type PurchaseOrderStatus } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";
import { setInventoryQuantities } from "./shopify-inventory.server";

export type PreviewLine = {
  productId: string;
  variantId: string;
  productTitle: string | null;
  variantTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  stockOutDays: number | null;
  avgDailySales: number | null;
  unitCost: number | null;
  suggestedQuantity: number;
};

export type SupplierPreview = {
  supplierId: string;
  supplierName: string;
  leadTimeDays: number;
  lines: PreviewLine[];
};

// Reorder up to `leadTimeDays` worth of sales as a buffer beyond zero, minus
// what's already on hand. Clamped to at least 1 so a generated line is never
// a zero-quantity no-op. Products with no sales history return 0 — the
// caller lists them for a manual quantity instead of guessing.
export function suggestReorderQuantity(currentQuantity: number, avgDailySales: number | null, leadTimeDays: number): number {
  if (!avgDailySales || avgDailySales <= 0) return 0;
  const target = Math.ceil(leadTimeDays * avgDailySales);
  return Math.max(1, target - currentQuantity);
}

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
  const [suppliers, settings, rows] = await Promise.all([
    prisma.supplier.findMany({
      where: { shop, ...(supplierIds ? { id: { in: supplierIds } } : {}) },
      orderBy: { name: "asc" },
    }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.inventoryTracking.findMany({
      where: {
        shop,
        supplierId: { not: null, ...(supplierIds ? { in: supplierIds } : {}) },
        monitoringEnabled: true,
        stockOutDays: { not: null },
      },
    }),
  ]);

  const defaultLeadTime = settings?.supplierLeadTimeDays ?? 7;
  const suppliersById = new Map(suppliers.map((s) => [s.id, s]));

  const bySupplier = new Map<string, PreviewLine[]>();
  for (const row of rows) {
    const supplierId = row.supplierId as string;
    const supplier = suppliersById.get(supplierId);
    if (!supplier) continue; // filtered out by supplierIds, or deleted between queries

    const leadTimeDays = supplier.leadTimeDays ?? defaultLeadTime;
    if (row.stockOutDays === null || row.stockOutDays > leadTimeDays) continue;

    const line: PreviewLine = {
      productId: row.productId.toString(),
      variantId: row.variantId.toString(),
      productTitle: row.productTitle,
      variantTitle: row.variantTitle,
      sku: row.sku,
      currentQuantity: row.currentQuantity,
      stockOutDays: row.stockOutDays,
      avgDailySales: row.avgDailySales,
      unitCost: row.unitCost,
      suggestedQuantity: suggestReorderQuantity(row.currentQuantity, row.avgDailySales, leadTimeDays),
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
  currentQuantity: number;
  stockOutDays: number | null;
  avgDailySales: number | null;
  unitCost: number | null;
  supplierId: string | null;
  suggestedQuantity: number;
};

// Any tracked product, independent of supplier assignment or at-risk status —
// the manual "search & add" side of PO creation. Forecast data is still
// attached (via suggestReorderQuantity against the shop's default lead time)
// so a manually-added line still gets a sane default quantity, but nothing
// here gates which products are searchable.
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

  return rows.map((row) => ({
    productId: row.productId.toString(),
    variantId: row.variantId.toString(),
    productTitle: row.productTitle,
    variantTitle: row.variantTitle,
    sku: row.sku,
    currentQuantity: row.currentQuantity,
    stockOutDays: row.stockOutDays,
    avgDailySales: row.avgDailySales,
    unitCost: row.unitCost,
    supplierId: row.supplierId,
    suggestedQuantity: suggestReorderQuantity(row.currentQuantity, row.avgDailySales, defaultLeadTime),
  }));
}

export type CreatePurchaseOrderLine = { variantId: string; quantityOrdered: number; unitCost?: number | null };

// Persists a PurchaseOrder from merchant-approved line items — forecast
// suggestions (previewPurchaseOrders) or manual search (searchTrackedProducts)
// both just feed this the same shape, so neither is a hard requirement to
// create a PO. Re-derives product/variant title, SKU, and a unitCost fallback
// from the DB rather than trusting whatever the client displayed, and keeps
// the poNumber transaction + P2002 collision retry from the previous
// forecast-only implementation.
export async function createPurchaseOrder(
  shop: string,
  supplierId: string,
  lines: CreatePurchaseOrderLine[],
): Promise<{ purchaseOrderId: string }> {
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

  const resolvedLines = positiveLines
    .map((l) => {
      const row = rowsByVariantId.get(l.variantId);
      if (!row) return null;
      return {
        productId: row.productId,
        variantId: BigInt(l.variantId),
        productTitle: row.productTitle,
        variantTitle: row.variantTitle,
        sku: row.sku,
        quantityOrdered: l.quantityOrdered,
        unitCost: l.unitCost ?? row.unitCost ?? null,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  if (resolvedLines.length === 0) {
    throw new Error("None of the selected products could be found.");
  }

  const totalCost = resolvedLines.reduce((sum, l) => sum + l.quantityOrdered * (l.unitCost ?? 0), 0);

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
            lineItems: { create: resolvedLines },
          },
        });
      });
      return { purchaseOrderId: purchaseOrder.id };
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

const VARIANT_INVENTORY_QUERY = `
  query getVariantInventory($id: ID!) {
    productVariant(id: $id) {
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
`;

type VariantInventoryResponse = {
  data?: {
    productVariant?: {
      inventoryItem?: {
        id: string;
        inventoryLevels: { edges: Array<{ node: { location: { id: string; name: string }; quantities: Array<{ quantity: number }> } }> };
      } | null;
    } | null;
  };
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
  errors?: Array<{ message: string }>;
};

// Receives quantities against an ordered/partially_received PO. Pushes the
// new absolute quantity to Shopify's location for each variant *before*
// touching the DB — if that call fails, nothing is recorded as received.
// Deliberately does not write InventoryTracking.currentQuantity directly:
// app.products.tsx documents that the inventory webhook is the sole source
// of truth for quantity/status, so this goes through Shopify the same way
// every other quantity change does, and lets webhooks.inventory.tsx pick up
// the resulting inventory_levels/update event.
// v1 scope: only single-location variants can be received here — a variant
// stocked at more than one location has no way to know which location the
// shipment actually arrived at, so this throws rather than silently
// guessing (previously picked "whichever location Shopify returns first",
// which could credit the wrong warehouse on a multi-location shop).
export async function receivePurchaseOrderItems(
  shop: string,
  purchaseOrderId: string,
  receipts: { lineItemId: string; quantityReceived: number }[],
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
      return quantityReceived > 0 ? { line, quantityReceived } : null;
    })
    .filter((x): x is { line: (typeof po.lineItems)[number]; quantityReceived: number } => x !== null);

  if (validReceipts.length === 0) {
    throw new Error("No valid quantities to receive.");
  }

  // Resolve each variant's inventoryItem + location + current available
  // quantity, then push the new absolute quantity to Shopify. Sequential
  // (not parallel) so the throttle check below can back off between calls —
  // same pattern as velocity.server.ts's calcSalesVelocity.
  const quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number; changeFromQuantity: null }> = [];
  for (const { line, quantityReceived } of validReceipts) {
    const res = await admin.graphql(VARIANT_INVENTORY_QUERY, {
      variables: { id: `gid://shopify/ProductVariant/${line.variantId.toString()}` },
    });
    const json: VariantInventoryResponse = await res.json();
    if (json.errors?.length) throw new Error(`Failed to look up inventory for ${line.productTitle ?? line.sku}: ${json.errors.map((e) => e.message).join("; ")}`);

    const throttle = json.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < throttle.restoreRate * 1.5) {
      const needed = throttle.restoreRate * 1.5 - throttle.currentlyAvailable;
      await new Promise((r) => setTimeout(r, Math.ceil((needed / throttle.restoreRate) * 1000)));
    }

    const inventoryItem = json.data?.productVariant?.inventoryItem;
    const levels = inventoryItem?.inventoryLevels.edges ?? [];
    if (!inventoryItem || levels.length === 0) {
      throw new Error(`Could not find inventory location for ${line.productTitle ?? line.sku}.`);
    }
    if (levels.length > 1) {
      throw new Error(
        `${line.productTitle ?? line.sku} is stocked at ${levels.length} locations — receiving isn't supported for multi-location products yet. Adjust its inventory directly in Shopify instead.`,
      );
    }
    const level = levels[0].node;
    const currentAvailable = level.quantities[0]?.quantity ?? 0;
    quantities.push({
      inventoryItemId: inventoryItem.id,
      locationId: level.location.id,
      quantity: currentAvailable + quantityReceived,
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
