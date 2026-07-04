import { useCallback, useEffect, useRef, useState } from "react";

// Generic counterpart to use-sync-stream.ts: opens an EventSource, waits for a
// single "done" (payload becomes `data`) or "error" event, then closes the
// connection. Used to load page data in the background instead of blocking the
// document response on it.
export function useSSEData<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!url) return;

    setError(null);
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.type === "done") {
        setData(payload.data as T);
        es.close();
        esRef.current = null;
      } else if (payload.type === "error") {
        setError(payload.message ?? "Failed to load.");
        es.close();
        esRef.current = null;
      }
    };

    es.onerror = () => {
      setError("Connection lost. Please retry.");
      es.close();
      esRef.current = null;
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [url, nonce]);

  const retry = useCallback(() => {
    setData(null);
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  return { data, error, retry };
}
