import { create } from "zustand";
import type { ProductsData } from "../lib/products-data.server";
import type { ProductRow, OptimisticPatch, VariantStatusRow } from "../components/products/ProductEditModal";
import { rollupVariantStatuses } from "../components/products/ProductEditModal";
import { assertClientOnly } from "./assert-client-only";

// Recomputes a product row's rolled-up fields from its (already-updated)
// variants array — shared by patchProduct (edit-modal saves) and
// applyInventoryDelta (webhook-pushed single-variant updates) below, so both
// call sites agree on how a product's worst-case status/total quantity is
// derived.
function rollupFromVariants(p: ProductRow, variants: VariantStatusRow[]): ProductRow {
  const statuses = variants.map((v) => v.inventoryStatus);
  return {
    ...p,
    variants,
    currentQuantity: variants.reduce((sum, v) => sum + v.currentQuantity, 0),
    inventoryStatus: rollupVariantStatuses(statuses),
    variantsAtRiskCount: statuses.filter((s) => s === "low_stock" || s === "out_of_stock").length,
  };
}

// Overlays a just-saved product-edit modal's OptimisticPatch onto its server
// row so the table reflects the change instantly instead of waiting for a
// page reload. Purely a display overlay — the real DB write (and any alert)
// still comes from the inventory webhook; see ProductEditModal.tsx.
function patchProduct(p: ProductRow, patch: OptimisticPatch): ProductRow {
  if (!patch.isTracked) {
    return {
      ...p,
      isTracked: false,
      inventoryStatus: "not_tracked",
      currentQuantity: 0,
      monitoringEnabled: false,
      expectedRestockDate: patch.expectedRestockDate,
      manualDailySales: patch.manualDailySales,
      supplierId: patch.supplierId,
      supplierName: patch.supplierName,
      unitCost: patch.unitCost,
      variants: [],
      variantCount: 0,
      variantsAtRiskCount: 0,
    };
  }

  if (!patch.variantPatches) {
    // Inventory data hadn't loaded when saved (e.g. a very fast save) — only
    // the non-quantity fields are safe to reflect optimistically.
    return {
      ...p,
      monitoringEnabled: patch.monitoringEnabled,
      expectedRestockDate: patch.expectedRestockDate,
      manualDailySales: patch.manualDailySales,
      supplierId: patch.supplierId,
      supplierName: patch.supplierName,
      unitCost: patch.unitCost,
    };
  }

  const variants = (p.variants ?? []).map((v) => {
    const vPatch = patch.variantPatches![v.variantId];
    return vPatch ? { ...v, ...vPatch } : v;
  });

  return {
    ...rollupFromVariants(p, variants),
    monitoringEnabled: patch.monitoringEnabled,
    expectedRestockDate: patch.expectedRestockDate,
    manualDailySales: patch.manualDailySales,
    supplierId: patch.supplierId,
    supplierName: patch.supplierName,
    unitCost: patch.unitCost,
  };
}

// Pushed from webhooks.inventory.tsx via broadcast.server.ts's publishEvent
// — the webhook already knows exactly which variant changed and to what, so
// the client can patch that one row in place instead of refetching the
// entire products list. Only touches quantity/status; every other field
// (monitoringEnabled, expectedRestockDate, etc.) is left untouched, unlike
// patchProduct above which always has a full OptimisticPatch to apply.
//
// Known limitation: if the current tab is filtered to a specific status
// (e.g. "Low Stock") and this delta moves the product into or out of that
// bucket, the row won't appear/disappear until the next real fetch — the
// quantity/status shown is still correct, just possibly under the "wrong"
// filter tab until then. Reserving full filter-membership correctness would
// require a refetch, which is exactly what this is meant to avoid for the
// common case (viewing "All").
export type InventoryDelta = {
  productId: string;
  variantId: string;
  currentQuantity: number;
  inventoryStatus: string;
};

function applyInventoryDeltaToProduct(p: ProductRow, delta: InventoryDelta): ProductRow {
  const variants = (p.variants ?? []).map((v) =>
    v.variantId === delta.variantId
      ? { ...v, currentQuantity: delta.currentQuantity, inventoryStatus: delta.inventoryStatus }
      : v,
  );
  return rollupFromVariants(p, variants);
}

type ProductsStore = {
  search: string;
  filter: string;
  after: string | null;
  prev: string;
  data: ProductsData | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  lastKey: string | null;
  setLoaderData: (fields: { search: string; filter: string; after: string | null; prev: string }) => void;
  setSSEState: (state: { data: ProductsData | null; error: string | null; retry: () => void; lastFetchedAt: number; lastKey: string | null }) => void;
  // Applies a just-saved edit-modal patch directly onto the store's copy of
  // the product, so ProductsTable (which reads `products` straight from
  // here) reflects the change immediately — there's no separate
  // "displayProducts" merge step in the route anymore.
  applyOptimisticPatch: (productId: string, patch: OptimisticPatch) => void;
  // Patches one variant's quantity/status in place from a webhook-pushed
  // live event — see applyInventoryDeltaToProduct above. No-op if the
  // product isn't in the currently cached page (e.g. a different filter/
  // search is active); it'll pick up the change on its next real fetch.
  applyInventoryDelta: (delta: InventoryDelta) => void;
};

export const useProductsStore = create<ProductsStore>((set, get) => ({
  search: "",
  filter: "all",
  after: null,
  prev: "",
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setLoaderData: (fields) => {
    assertClientOnly("useProductsStore", "setLoaderData");
    set(fields);
  },
  setSSEState: (state) => {
    assertClientOnly("useProductsStore", "setSSEState");
    set(state);
  },
  applyOptimisticPatch: (productId, patch) => {
    assertClientOnly("useProductsStore", "applyOptimisticPatch");
    const { data } = get();
    if (!data) return;
    set({
      data: {
        ...data,
        products: data.products.map((p) => (p.productId === productId ? patchProduct(p, patch) : p)),
      },
      // Marks the store fresh as of right now — see the matching comment on
      // applyInventoryDelta below for why this matters.
      lastFetchedAt: Date.now(),
    });
  },
  applyInventoryDelta: (delta) => {
    assertClientOnly("useProductsStore", "applyInventoryDelta");
    const { data } = get();
    if (!data) return;
    set({
      data: {
        ...data,
        products: data.products.map((p) => (p.productId === delta.productId ? applyInventoryDeltaToProduct(p, delta) : p)),
      },
      // A full refetch can already be in flight when this delta lands (e.g.
      // triggered moments earlier by an unrelated topic bump). Bumping
      // lastFetchedAt here means use-cached-sse-data.ts's staleness check
      // can tell that fetch is now older than what the store already has,
      // so it discards that fetch's eventual response instead of letting it
      // overwrite this delta with data that was current only as of before
      // the delta arrived.
      lastFetchedAt: Date.now(),
    });
  },
}));

// Pure — no store access. The route calls this with loader data directly
// (never the store's mirrored copy, which lags by one effect tick) to build
// the SSE URL; descendants call it with their own store-read filter state to
// build filter/pagination links.
export function buildProductsUrl(
  { search, filter, prev }: { search: string; filter: string; prev: string },
  params: Record<string, string | null>,
): string {
  const p = new URLSearchParams();
  if (search) p.set("search", search);
  if (filter !== "all") p.set("filter", filter);
  if (prev) p.set("prev", prev);
  Object.entries(params).forEach(([k, v]) => { if (v) p.set(k, v); else p.delete(k); });
  const qs = p.toString();
  return `/app/products${qs ? `?${qs}` : ""}`;
}
