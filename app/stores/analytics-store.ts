import { create } from "zustand";
import type { AnalyticsData } from "../lib/analytics-data.server";
import { createSSECacheSlice, type SSECacheSlice } from "./sse-cache-slice";

export type AnalyticsStore = SSECacheSlice<AnalyticsData>;

export const useAnalyticsStore = create<AnalyticsStore>()(createSSECacheSlice("useAnalyticsStore"));
