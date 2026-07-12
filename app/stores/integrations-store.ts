import { create } from "zustand";
import type { IntegrationsData } from "../lib/integrations-data.server";
import { assertClientOnly } from "./assert-client-only";

type IntegrationsStore = {
  slackConnectToken: string | null;
  asanaConnectToken: string | null;
  data: IntegrationsData | null;
  error: string | null;
  retry: (() => void) | null;
  setLoaderData: (fields: { slackConnectToken: string; asanaConnectToken: string }) => void;
  setSSEState: (state: { data: IntegrationsData | null; error: string | null; retry: () => void }) => void;
};

export const useIntegrationsStore = create<IntegrationsStore>((set) => ({
  slackConnectToken: null,
  asanaConnectToken: null,
  data: null,
  error: null,
  retry: null,
  setLoaderData: (fields) => {
    assertClientOnly("useIntegrationsStore", "setLoaderData");
    set(fields);
  },
  setSSEState: (state) => {
    assertClientOnly("useIntegrationsStore", "setSSEState");
    set(state);
  },
}));
