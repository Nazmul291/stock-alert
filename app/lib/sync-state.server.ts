type ProgressCallback = (pct: number, done: boolean, error?: string) => void;

type ShopSyncState = {
  running: boolean;
  startedAt: number;
  completedAt?: number;
  progress: number;
  synced?: number;
  error?: string;
};

const state = new Map<string, ShopSyncState>();
const callbacks = new Map<string, Set<ProgressCallback>>();

function notify(shop: string, pct: number, done: boolean, error?: string) {
  callbacks.get(shop)?.forEach((cb) => cb(pct, done, error));
  if (done || error) callbacks.delete(shop);
}

export const syncState = {
  start(shop: string) {
    state.set(shop, { running: true, startedAt: Date.now(), progress: 5 });
    notify(shop, 5, false);
  },

  progress(shop: string, pct: number) {
    const prev = state.get(shop);
    if (!prev?.running) return;
    state.set(shop, { ...prev, progress: pct });
    notify(shop, pct, false);
  },

  done(shop: string, synced: number) {
    const prev = state.get(shop);
    state.set(shop, { running: false, startedAt: prev?.startedAt ?? Date.now(), completedAt: Date.now(), progress: 100, synced });
    notify(shop, 100, true);
  },

  fail(shop: string, error: string) {
    const prev = state.get(shop);
    state.set(shop, { running: false, startedAt: prev?.startedAt ?? Date.now(), progress: 0, error });
    notify(shop, 0, false, error);
  },

  onProgress(shop: string, cb: ProgressCallback): () => void {
    if (!callbacks.has(shop)) callbacks.set(shop, new Set());
    callbacks.get(shop)!.add(cb);
    return () => callbacks.get(shop)?.delete(cb);
  },

  get(shop: string): ShopSyncState | null {
    return state.get(shop) ?? null;
  },
};
