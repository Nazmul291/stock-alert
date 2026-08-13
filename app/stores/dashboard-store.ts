import { create } from "zustand";
import type { DashboardData } from "../lib/dashboard-data.server";
import { assertClientOnly } from "./assert-client-only";
import { createSSECacheSlice, type SSECacheSlice } from "./sse-cache-slice";

export type DashboardStore = SSECacheSlice<DashboardData> & {
  shop: string | null;
  setLoaderData: (fields: { shop: string }) => void;
};

export const useDashboardStore = create<DashboardStore>()((set, get, api) => ({
  ...createSSECacheSlice<DashboardData, DashboardStore>("useDashboardStore")(set, get, api),
  shop: null,
  setLoaderData: (fields) => {
    assertClientOnly("useDashboardStore", "setLoaderData");
    set(fields);
  },
}));
