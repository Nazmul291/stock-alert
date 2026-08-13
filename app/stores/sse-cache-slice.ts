import type { StateCreator } from "zustand";
import { assertClientOnly } from "./assert-client-only";

// Every store backing a page's useCachedSSEData call (see
// use-cached-sse-data.ts) needs this exact same shape and setSSEState
// implementation — cachedData/cachedKey/lastFetchedAt read back out for the
// hook's staleness check, setSSEState written back into on every
// fetch/apply. This used to be hand-copied into 8 separate store files with
// only the data type and store name changed; this is the one place that
// pairing lives now.
export type SSECacheSlice<T> = {
  data: T | null;
  error: string | null;
  retry: (() => void) | null;
  lastFetchedAt: number;
  lastKey: string | null;
  setSSEState: (state: {
    data: T | null;
    error: string | null;
    retry: () => void;
    lastFetchedAt: number;
    lastKey: string | null;
  }) => void;
};

// Generic over the *full* store shape (not just the slice) so this composes
// correctly with `create<StoreShape>()((...a) => ({ ...createSSECacheSlice(...)(...a), ...ownFields }))`
// per Zustand's slice pattern — StoreShape is whatever the concrete store
// adds on top of SSECacheSlice<T>.
export function createSSECacheSlice<T, StoreShape extends SSECacheSlice<T>>(
  storeName: string,
): StateCreator<StoreShape, [], [], SSECacheSlice<T>> {
  return (set) => ({
    data: null,
    error: null,
    retry: null,
    lastFetchedAt: 0,
    lastKey: null,
    setSSEState: (state) => {
      assertClientOnly(storeName, "setSSEState");
      set(state as Partial<StoreShape>);
    },
  });
}
