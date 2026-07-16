import { Prisma, type PurchaseOrderStatus } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

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

// Persists one PurchaseOrder + line items for a single supplier, re-deriving
// the at-risk set from the DB rather than trusting a client-submitted
// snapshot (quantityOverrides lets the merchant adjust suggested quantities
// from the preview screen without the server blindly accepting arbitrary
// line items). Retries once on a poNumber collision (P2002) — see
// nextPoNumber; the only realistic collision is a double-click, not real
// concurrent multi-user PO creation.
export async function generatePurchaseOrder(
  shop: string,
  supplierId: string,
  opts?: { quantityOverrides?: Record<string, number> },
): Promise<{ purchaseOrderId: string }> {
  const [preview] = await previewPurchaseOrders(shop, [supplierId]);
  if (!preview || preview.lines.length === 0) {
    throw new Error("No at-risk products found for this supplier.");
  }

  const lineItems = preview.lines
    .map((line) => {
      const quantityOrdered = opts?.quantityOverrides?.[line.variantId] ?? line.suggestedQuantity;
      return quantityOrdered > 0 ? { line, quantityOrdered } : null;
    })
    .filter((x): x is { line: PreviewLine; quantityOrdered: number } => x !== null);

  if (lineItems.length === 0) {
    throw new Error("No line items with a positive quantity to order.");
  }

  const totalCost = lineItems.reduce((sum, { line, quantityOrdered }) => sum + quantityOrdered * (line.unitCost ?? 0), 0);

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
            generatedFromForecast: true,
            lineItems: {
              create: lineItems.map(({ line, quantityOrdered }) => ({
                productId: BigInt(line.productId),
                variantId: BigInt(line.variantId),
                productTitle: line.productTitle,
                variantTitle: line.variantTitle,
                sku: line.sku,
                quantityOrdered,
                unitCost: line.unitCost,
              })),
            },
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
  throw new Error("Failed to generate purchase order.");
}

export function nextStatus(lineItems: { quantityOrdered: number; quantityReceived: number }[]): PurchaseOrderStatus {
  return lineItems.every((li) => li.quantityReceived >= li.quantityOrdered) ? "received" : "partially_received";
}

const VARIANT_INVENTORY_QUERY = `
  query getVariantInventory($id: ID!) {
    productVariant(id: $id) {
      inventoryItem {
        id
        inventoryLevels(first: 1) {
          edges {
            node {
              location { id }
              quantities(names: ["available"]) { quantity }
            }
          }
        }
      }
    }
  }
`;

const INVENTORY_SET_MUTATION = `
  mutation inventorySetQuantities($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
    inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
      userErrors { field message }
    }
  }
`;

type VariantInventoryResponse = {
  data?: {
    productVariant?: {
      inventoryItem?: {
        id: string;
        inventoryLevels: { edges: Array<{ node: { location: { id: string }; quantities: Array<{ quantity: number }> } }> };
      } | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
};

// Receives quantities against an ordered/partially_received PO. Pushes the
// new absolute quantity to Shopify's primary location for each variant
// *before* touching the DB — if that call fails, nothing is recorded as
// received. Deliberately does not write InventoryTracking.currentQuantity
// directly: app.products.tsx documents that the inventory webhook is the
// sole source of truth for quantity/status, so this goes through Shopify
// the same way every other quantity change does, and lets
// webhooks.inventory.tsx pick up the resulting inventory_levels/update event.
// v1 scope: assumes single-location inventory (receives at whichever
// location Shopify returns first for the variant).
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

  // Resolve each variant's inventoryItem + primary location + current
  // available quantity, then push the new absolute quantity to Shopify.
  const quantities: Array<{ inventoryItemId: string; locationId: string; quantity: number; changeFromQuantity: null }> = [];
  for (const { line, quantityReceived } of validReceipts) {
    const res = await admin.graphql(VARIANT_INVENTORY_QUERY, {
      variables: { id: `gid://shopify/ProductVariant/${line.variantId.toString()}` },
    });
    const json: VariantInventoryResponse = await res.json();
    if (json.errors?.length) throw new Error(`Failed to look up inventory for ${line.productTitle ?? line.sku}: ${json.errors.map((e) => e.message).join("; ")}`);

    const inventoryItem = json.data?.productVariant?.inventoryItem;
    const level = inventoryItem?.inventoryLevels.edges[0]?.node;
    if (!inventoryItem || !level) {
      throw new Error(`Could not find inventory location for ${line.productTitle ?? line.sku}.`);
    }
    const currentAvailable = level.quantities[0]?.quantity ?? 0;
    quantities.push({
      inventoryItemId: inventoryItem.id,
      locationId: level.location.id,
      quantity: currentAvailable + quantityReceived,
      changeFromQuantity: null,
    });
  }

  const invRes = await admin.graphql(INVENTORY_SET_MUTATION, {
    variables: {
      idempotencyKey: crypto.randomUUID(),
      input: { name: "available", reason: "received", quantities },
    },
  });
  const invJson: { data?: { inventorySetQuantities?: { userErrors: Array<{ message: string }> } } } = await invRes.json();
  const invErrs = invJson.data?.inventorySetQuantities?.userErrors ?? [];
  if (invErrs.length > 0) throw new Error(invErrs.map((e) => e.message).join(", "));

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
