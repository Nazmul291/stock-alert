// The quick-edit modal that used to live here has been retired — the
// Product Details Page (app/routes/app.products.$productId.tsx) is now the
// one place to view/edit a product. This file only still exists because
// several other modules import the row/patch types and the status-rollup
// helper below; nothing here renders anything.

export type VariantStatusRow = {
  id: string;
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  inventoryStatus: string;
};

export type ProductRow = {
  id: string | number;
  productId: string;
  productTitle: string;
  sku: string | null;
  currentQuantity: number;
  inventoryStatus: string;
  isHidden: boolean;
  isTracked: boolean;
  monitoringEnabled: boolean;
  imageUrl: string | null;
  imageAlt: string;
  shopifyStatus: string;
  inventoryItemId: string | null;
  stockOutDays?: number | null;
  avgDailySales?: number | null;
  manualDailySales?: number | null;
  expectedRestockDate?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  unitCost?: number | null;
  variants?: VariantStatusRow[];
  variantCount?: number;
  variantsAtRiskCount?: number;
};

// Emitted right after a successful save so the products table can update
// its display instantly instead of waiting on a page reload — the real
// inventory webhook is still the only thing that writes currentQuantity/
// inventoryStatus to the DB (see webhooks.inventory.tsx), this is purely a
// client-side reflection of what was just submitted.
export type OptimisticPatch = {
  monitoringEnabled: boolean;
  expectedRestockDate: string | null;
  manualDailySales: number | null;
  isTracked: boolean;
  supplierId: string | null;
  supplierName: string | null;
  unitCost: number | null;
  variantPatches?: Record<string, { currentQuantity: number; inventoryStatus: string }>;
};

// Client-safe duplicate of inventory-rollup.server.ts's classifyProductStatus
// (that one is .server.ts and gets stripped from the client bundle) — must
// stay in sync with it. Worst-case status across a product's variants.
export function rollupVariantStatuses(variantStatuses: string[]): string {
  if (variantStatuses.length === 0) return "in_stock";
  if (variantStatuses.every((s) => s === "deactivated")) return "deactivated";
  if (variantStatuses.every((s) => s === "requires_upgrade")) return "requires_upgrade";
  const relevant = variantStatuses.filter((s) => s !== "deactivated" && s !== "requires_upgrade");
  if (relevant.every((s) => s === "out_of_stock")) return "out_of_stock";
  if (relevant.some((s) => s === "out_of_stock" || s === "low_stock")) return "low_stock";
  return "in_stock";
}
