import { create } from "zustand";
import type { IntegrationsData } from "../lib/integrations-data.server";
import { assertClientOnly } from "./assert-client-only";
import { createSSECacheSlice, type SSECacheSlice } from "./sse-cache-slice";

export type IntegrationsStore = SSECacheSlice<IntegrationsData> & {
  slackConnectToken: string | null;
  asanaConnectToken: string | null;
  setLoaderData: (fields: { slackConnectToken: string; asanaConnectToken: string }) => void;
};

export const useIntegrationsStore = create<IntegrationsStore>()((set, get, api) => ({
  ...createSSECacheSlice<IntegrationsData, IntegrationsStore>("useIntegrationsStore")(set, get, api),
  slackConnectToken: null,
  asanaConnectToken: null,
  setLoaderData: (fields) => {
    assertClientOnly("useIntegrationsStore", "setLoaderData");
    set(fields);
  },
}));
