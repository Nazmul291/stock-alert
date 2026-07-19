import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveEventsStore } from "../stores/live-events-store";

export function useSyncStream(shop: string, syncRunning: boolean) {
  const bump = useLiveEventsStore((s) => s.bump);
  const [syncPct, setSyncPct] = useState<number | null>(null);
  const [syncStreamError, setSyncStreamError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const openStream = useCallback(() => {
    if (esRef.current) return;
    setSyncStreamError(null);
    const es = new EventSource(`/api/sync-stream?shop=${encodeURIComponent(shop)}`);
    esRef.current = es;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "progress") setSyncPct(data.pct);
      if (data.type === "done") {
        setSyncPct(100);
        es.close();
        esRef.current = null;
        // sync-state.server.ts's done() also publishes a "products"/"dashboard"
        // live event over Redis, for other open tabs — but this page already
        // knows sync just finished without waiting on that round trip (SSE
        // subscriber setup, pub/sub delivery, EventSource dispatch), so bump
        // directly here too. useCachedSSEData treats either source the same.
        bump(["products", "dashboard", "analytics"]);
        setTimeout(() => setSyncPct(null), 1000);
      }
      if (data.type === "idle") {
        es.close();
        esRef.current = null;
        setSyncPct(null);
      }
      if (data.type === "error" || data.type === "auth_error") {
        setSyncStreamError(data.message ?? "Sync failed — network error.");
        es.close();
        esRef.current = null;
        setSyncPct(null);
      }
    };
    es.onerror = () => {
      setSyncStreamError("Sync connection lost. Please retry.");
      es.close();
      esRef.current = null;
      setSyncPct(null);
    };
  }, [shop, bump]);

  useEffect(() => {
    if (syncRunning && !esRef.current) openStream();
  }, [syncRunning, openStream]);

  useEffect(() => () => { esRef.current?.close(); }, []);

  return {
    syncPct,
    syncStreamError,
    clearError: () => setSyncStreamError(null),
    openStream,
  };
}
