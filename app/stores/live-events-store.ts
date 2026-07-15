import { create } from "zustand";
import { assertClientOnly } from "./assert-client-only";

type LiveEventsStore = {
  // topic -> timestamp of the last time it was bumped (server push or a
  // same-tab mutation calling bump() directly — see use-cached-sse-data.ts).
  version: Record<string, number>;
  bump: (topics: string[]) => void;
};

export const useLiveEventsStore = create<LiveEventsStore>((set, get) => ({
  version: {},
  bump: (topics) => {
    assertClientOnly("useLiveEventsStore", "bump");
    const now = Date.now();
    const version = { ...get().version };
    for (const topic of topics) version[topic] = now;
    set({ version });
  },
}));
