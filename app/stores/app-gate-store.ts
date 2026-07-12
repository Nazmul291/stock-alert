import { create } from "zustand";
import { assertClientOnly } from "./assert-client-only";

export type GateData = { redirectTo: string | null; alertsToday: number };

// "loading": gate hasn't settled yet. "redirect": gate says bounce away —
// child routes should keep showing their skeleton while the navigate() in
// app.tsx is in flight. "ready": gate settled with nothing to redirect to
// (or the gate stream itself failed — fails open rather than blocking forever).
export type AppStatus = "loading" | "redirect" | "ready";

type AppGateStore = {
  gate: GateData | null;
  gateError: string | null;
  appStatus: AppStatus;
  setGateState: (state: { gate: GateData | null; gateError: string | null }) => void;
  setAppStatus: (status: AppStatus) => void;
};

// Populated by app.tsx (the /app layout route) from its own useSSEData call —
// replaces the old AppOutletContext/useOutletContext handoff, so any /app/*
// route can read appStatus/gate directly instead of only the one route
// rendered as this layout's immediate Outlet child.
export const useAppGateStore = create<AppGateStore>((set) => ({
  gate: null,
  gateError: null,
  appStatus: "loading",
  setGateState: (state) => {
    assertClientOnly("useAppGateStore", "setGateState");
    set(state);
  },
  setAppStatus: (appStatus) => {
    assertClientOnly("useAppGateStore", "setAppStatus");
    set({ appStatus });
  },
}));
