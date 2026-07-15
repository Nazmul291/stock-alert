import { create } from "zustand";
import type { AnalyticsData } from "../lib/analytics-data.server";
import { assertClientOnly } from "./assert-client-only";

type AnalyticsStore = {
  data: AnalyticsData | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  lastKey: string | null;
  setSSEState: (state: { data: AnalyticsData | null; error: string | null; retry: () => void; lastFetchedAt: number; lastKey: string }) => void;
};

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setSSEState: (state) => {
    assertClientOnly("useAnalyticsStore", "setSSEState");
    set(state);
  },
}));
