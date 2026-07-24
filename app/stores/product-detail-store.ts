import { create } from "zustand";
import type { ProductDetailData } from "../lib/product-detail.server";
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
};

export const useProductDetailStore = create<ProductDetailStore>((set) => ({
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setSSEState: (state) => {
    assertClientOnly("useProductDetailStore", "setSSEState");
    set(state);
  },
}));
