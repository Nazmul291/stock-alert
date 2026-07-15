import { create } from "zustand";
import type { DashboardData } from "../lib/dashboard-data.server";
import { assertClientOnly } from "./assert-client-only";

type DashboardStore = {
  shop: string | null;
  data: DashboardData | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  lastKey: string | null;
  setLoaderData: (fields: { shop: string }) => void;
  setSSEState: (state: { data: DashboardData | null; error: string | null; retry: () => void; lastFetchedAt: number; lastKey: string | null }) => void;
};

export const useDashboardStore = create<DashboardStore>((set) => ({
  shop: null,
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setLoaderData: (fields) => {
    assertClientOnly("useDashboardStore", "setLoaderData");
    set(fields);
  },
  setSSEState: (state) => {
    assertClientOnly("useDashboardStore", "setSSEState");
    set(state);
  },
}));
