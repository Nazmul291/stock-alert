import { create } from "zustand";
import type { AnalyticsData } from "../lib/analytics-data.server";
import { assertClientOnly } from "./assert-client-only";

type AnalyticsStore = {
  data: AnalyticsData | null;
  error: string | null;
  retry: (() => void) | null;
  setSSEState: (state: { data: AnalyticsData | null; error: string | null; retry: () => void }) => void;
};

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  data: null,
  error: null,
  retry: null,
  setSSEState: (state) => {
    assertClientOnly("useAnalyticsStore", "setSSEState");
    set(state);
  },
}));
