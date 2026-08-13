import { create } from "zustand";
import type { AlertsData } from "../lib/alert-history-data.server";
import { assertClientOnly } from "./assert-client-only";
import { createSSECacheSlice, type SSECacheSlice } from "./sse-cache-slice";

export type AlertHistoryStore = SSECacheSlice<AlertsData> & {
  page: number;
  typeFilter: string;
  productSearch: string;
  setLoaderData: (fields: { page: number; typeFilter: string; productSearch: string }) => void;
};

export const useAlertHistoryStore = create<AlertHistoryStore>()((set, get, api) => ({
  ...createSSECacheSlice<AlertsData, AlertHistoryStore>("useAlertHistoryStore")(set, get, api),
  page: 1,
  typeFilter: "all",
  productSearch: "",
  setLoaderData: (fields) => {
    assertClientOnly("useAlertHistoryStore", "setLoaderData");
    set(fields);
  },
}));

// Pure — no store access. The route calls this with loader data directly
// (never the store's mirrored copy, which lags by one effect tick) to build
// the SSE URL; descendants call it with their own store-read filter state to
// build pagination/filter links.
export function buildAlertHistoryUrl(
  { typeFilter, productSearch, page }: { typeFilter: string; productSearch: string; page: number },
  overrides: Record<string, string | number | null>,
): string {
  const p = new URLSearchParams();
  if (typeFilter !== "all") p.set("type", typeFilter);
  if (productSearch) p.set("product", productSearch);
  if (page > 1) p.set("page", String(page));
  for (const [k, v] of Object.entries(overrides)) {
    if (v === null || v === "all" || v === 1) p.delete(k);
    else p.set(k, String(v));
  }
  const qs = p.toString();
  return `/app/alert-history${qs ? `?${qs}` : ""}`;
}
