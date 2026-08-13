import { create } from "zustand";
import type { BackInStockData } from "../lib/back-in-stock-data.server";
import { assertClientOnly } from "./assert-client-only";
import { createSSECacheSlice, type SSECacheSlice } from "./sse-cache-slice";

export type BackInStockStore = SSECacheSlice<BackInStockData> & {
  page: number;
  setLoaderData: (fields: { page: number }) => void;
};

export const useBackInStockStore = create<BackInStockStore>()((set, get, api) => ({
  ...createSSECacheSlice<BackInStockData, BackInStockStore>("useBackInStockStore")(set, get, api),
  page: 1,
  setLoaderData: (fields) => {
    assertClientOnly("useBackInStockStore", "setLoaderData");
    set(fields);
  },
}));
