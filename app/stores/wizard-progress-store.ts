import { create } from "zustand";
import type { WizardProgress } from "../lib/wizard-progress.server";
import { assertClientOnly } from "./assert-client-only";

type WizardProgressStore = {
  progress: WizardProgress | null;
  setProgress: (progress: WizardProgress) => void;
  patchProgress: (patch: Partial<WizardProgress>) => void;
};

// Hydrated from each route's own loader (app.tsx and app._index.tsx both
// compute the same WizardProgress independently — see
// lib/wizard-progress.server.ts) via a mount/revalidation effect, same
// pattern as dashboard-store.
//
// patchProgress is what actually makes this worth having instead of just
// reading useLoaderData directly: app._index.tsx calls it the instant a
// wizard step's form submits (before the server round trip finishes), so
// the step transition — and app.tsx's nav-hide decision, reading the same
// store — happen immediately instead of waiting on a full loader
// revalidation. The subsequent revalidation's setProgress call then
// reconciles the store with the authoritative DB state, correcting it back
// if the write ever failed.
export const useWizardProgressStore = create<WizardProgressStore>((set) => ({
  progress: null,
  setProgress: (progress) => {
    assertClientOnly("useWizardProgressStore", "setProgress");
    set({ progress });
  },
  patchProgress: (patch) => {
    assertClientOnly("useWizardProgressStore", "patchProgress");
    set((s) => (s.progress ? { progress: { ...s.progress, ...patch } } : s));
  },
}));
