import { create } from "zustand";
import type { ProductDetailData, ProductPurchaseOrderRow } from "../lib/product-detail.server";
import { assertClientOnly } from "./assert-client-only";

type ProductDetailStore = {
  data: ProductDetailData | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  // Holds the productId this data belongs to — useCachedSSEData treats a
  // different key as stale, so navigating from one product's page to
  // another's fetches fresh data instead of flashing the previous product.
  lastKey: string | null;
  setSSEState: (state: { data: ProductDetailData | null; error: string | null; retry: () => void; lastFetchedAt: number; lastKey: string }) => void;
  // Prepends a just-created PO straight into the store so the Purchase
  // Orders list reflects it immediately, instead of only relying on the
  // background SSE refetch that create_po's live-events bump triggers (that
  // refetch still happens and reconciles/corrects this, it just isn't the
  // only way the new PO becomes visible) — see ProductCreatePoCard.
  addPurchaseOrder: (po: ProductPurchaseOrderRow) => void;
  // Patches an existing PO in place (status/supplier/line-item edits from
  // ManagePurchaseOrderModal's Save Changes/Order Now) so the pending list
  // and the still-open modal both reflect the change immediately — same
  // "instant, then reconciled by the next real fetch" reasoning as
  // addPurchaseOrder above.
  updatePurchaseOrder: (id: string, patch: Partial<ProductPurchaseOrderRow>) => void;
};

export const useProductDetailStore = create<ProductDetailStore>((set, get) => ({
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setSSEState: (state) => {
    assertClientOnly("useProductDetailStore", "setSSEState");
    set(state);
  },
  addPurchaseOrder: (po) => {
    assertClientOnly("useProductDetailStore", "addPurchaseOrder");
    const { data } = get();
    if (!data) return;
    set({
      data: { ...data, purchaseOrders: [po, ...data.purchaseOrders] },
      // Marks the store fresh as of right now — same reasoning as
      // products-store.ts's applyOptimisticPatch/applyInventoryDelta.
      lastFetchedAt: Date.now(),
    });
  },
  updatePurchaseOrder: (id, patch) => {
    assertClientOnly("useProductDetailStore", "updatePurchaseOrder");
    const { data } = get();
    if (!data) return;
    set({
      data: { ...data, purchaseOrders: data.purchaseOrders.map((po) => (po.id === id ? { ...po, ...patch } : po)) },
      lastFetchedAt: Date.now(),
    });
  },
}));
