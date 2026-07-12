import { create } from "zustand";
import type { ProductsData } from "../lib/products-data.server";
import type { ProductRow, OptimisticPatch } from "../components/products/ProductEditModal";
import { rollupVariantStatuses } from "../components/products/ProductEditModal";
import { assertClientOnly } from "./assert-client-only";

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
    };
  }

  const variants = (p.variants ?? []).map((v) => {
    const vPatch = patch.variantPatches![v.variantId];
    return vPatch ? { ...v, ...vPatch } : v;
  });
  const statuses = variants.map((v) => v.inventoryStatus);

  return {
    ...p,
    monitoringEnabled: patch.monitoringEnabled,
    expectedRestockDate: patch.expectedRestockDate,
    manualDailySales: patch.manualDailySales,
    variants,
    currentQuantity: variants.reduce((sum, v) => sum + v.currentQuantity, 0),
    inventoryStatus: rollupVariantStatuses(statuses),
    variantsAtRiskCount: statuses.filter((s) => s === "low_stock" || s === "out_of_stock").length,
  };
}

type ProductsStore = {
  search: string;
  filter: string;
  after: string | null;
  prev: string;
  data: ProductsData | null;
  error: string | null;
  retry: (() => void) | null;
  setLoaderData: (fields: { search: string; filter: string; after: string | null; prev: string }) => void;
  setSSEState: (state: { data: ProductsData | null; error: string | null; retry: () => void }) => void;
  // Applies a just-saved edit-modal patch directly onto the store's copy of
  // the product, so ProductsTable (which reads `products` straight from
  // here) reflects the change immediately — there's no separate
  // "displayProducts" merge step in the route anymore.
  applyOptimisticPatch: (productId: string, patch: OptimisticPatch) => void;
};

export const useProductsStore = create<ProductsStore>((set, get) => ({
  search: "",
  filter: "all",
  after: null,
  prev: "",
  data: null,
  error: null,
  retry: null,
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
