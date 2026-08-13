import { create } from "zustand";
import type { SettingsData } from "../lib/settings-data.server";
import { createSSECacheSlice, type SSECacheSlice } from "./sse-cache-slice";

export type SettingsStore = SSECacheSlice<SettingsData>;

export const useSettingsStore = create<SettingsStore>()(createSSECacheSlice("useSettingsStore"));
