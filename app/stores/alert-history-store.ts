import { create } from "zustand";
import type { AlertsData } from "../lib/alert-history-data.server";
import { assertClientOnly } from "./assert-client-only";

type AlertHistoryStore = {
  page: number;
  typeFilter: string;
  productSearch: string;
  data: AlertsData | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  lastKey: string | null;
  setLoaderData: (fields: { page: number; typeFilter: string; productSearch: string }) => void;
  setSSEState: (state: { data: AlertsData | null; error: string | null; retry: () => void; lastFetchedAt: number; lastKey: string }) => void;
};

export const useAlertHistoryStore = create<AlertHistoryStore>((set) => ({
  page: 1,
  typeFilter: "all",
  productSearch: "",
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setLoaderData: (fields) => {
    assertClientOnly("useAlertHistoryStore", "setLoaderData");
    set(fields);
  },
  setSSEState: (state) => {
    assertClientOnly("useAlertHistoryStore", "setSSEState");
    set(state);
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
