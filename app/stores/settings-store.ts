import { create } from "zustand";
import type { SettingsData } from "../lib/settings-data.server";
import { assertClientOnly } from "./assert-client-only";

type SettingsStore = {
  data: SettingsData | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  lastKey: string | null;
  setSSEState: (state: { data: SettingsData | null; error: string | null; retry: () => void; lastFetchedAt: number; lastKey: string }) => void;
};

export const useSettingsStore = create<SettingsStore>((set) => ({
  data: null,
  error: null,
  retry: null,
  lastFetchedAt: 0,
  lastKey: null,
  setSSEState: (state) => {
    assertClientOnly("useSettingsStore", "setSSEState");
    set(state);
  },
}));
