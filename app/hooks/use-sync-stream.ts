import { useCallback, useEffect, useRef, useState } from "react";
import { useRevalidator } from "react-router";

export function useSyncStream(shop: string, syncRunning: boolean) {
  const [syncPct, setSyncPct] = useState<number | null>(null);
  const [syncStreamError, setSyncStreamError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const { revalidate } = useRevalidator();

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
        setTimeout(() => { setSyncPct(null); revalidate(); }, 1000);
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
  }, [shop, revalidate]);

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
