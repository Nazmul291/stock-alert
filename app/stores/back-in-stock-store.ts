import { create } from "zustand";
import type { BackInStockData } from "../lib/back-in-stock-data.server";
import { assertClientOnly } from "./assert-client-only";

type BackInStockStore = {
  page: number;
  data: BackInStockData | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  lastKey: string | null;
  setLoaderData: (fields: { page: number }) => void;
  setSSEState: (state: { data: BackInStockData | null; error: string | null; retry: () => void; lastFetchedAt: number; lastKey: string }) => void;
};

export const useBackInStockStore = create<BackInStockStore>((set) => ({
  page: 1,
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setLoaderData: (fields) => {
    assertClientOnly("useBackInStockStore", "setLoaderData");
    set(fields);
  },
  setSSEState: (state) => {
    assertClientOnly("useBackInStockStore", "setSSEState");
    set(state);
  },
}));
