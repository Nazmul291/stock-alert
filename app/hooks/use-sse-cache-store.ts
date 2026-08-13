import type { StoreApi, UseBoundStore } from "zustand";
import { useCachedSSEData } from "./use-cached-sse-data";
import type { SSECacheSlice } from "../stores/sse-cache-slice";

// Wires any store built from sse-cache-slice.ts's createSSECacheSlice
// straight into useCachedSSEData — every page fetching its data this way
// needs the identical "pull data/lastKey/lastFetchedAt/setSSEState out of
// the store, hand them to useCachedSSEData" wiring, so this is the one
// place it's written instead of being hand-copied into each page.
export function useSSECacheStore<T, StoreShape extends SSECacheSlice<T>>(
  useStore: UseBoundStore<StoreApi<StoreShape>>,
  key: string,
  buildUrl: () => string,
  topic: string,
): void {
  const cachedData = useStore((s) => s.data);
  const cachedKey = useStore((s) => s.lastKey);
  const lastFetchedAt = useStore((s) => s.lastFetchedAt);
  const setSSEState = useStore((s) => s.setSSEState);
  useCachedSSEData<T>(key, buildUrl, topic, cachedData, cachedKey, lastFetchedAt, setSSEState);
}
