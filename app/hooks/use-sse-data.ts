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
  // Bumped once per fetch attempt (every effect run) — an onmessage/onerror
  // callback only applies its result if it's still the most recent attempt.
  // Needed because this effect can now re-run multiple times per mount
  // (use-cached-sse-data.ts reopens a fetch whenever a live-push event marks
  // the page stale), and closing an EventSource via `es.close()` doesn't
  // retroactively cancel a message that was already in flight — a slow,
  // superseded fetch's response arriving after a newer one already
  // committed would otherwise silently overwrite fresh data with stale data.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!url) return;

    const myGeneration = ++generationRef.current;

    // Reset both, not just error — leaving a previous fetch's resolved
    // `data` in place would make the caller's "still in flight" check
    // (`data === null && error === null`) see stale data as if this new
    // fetch had already finished, prematurely marking the page fresh again
    // and tearing down the real in-flight connection before its actual
    // response ever arrives.
    setData(null);
    setError(null);
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (e) => {
      if (myGeneration !== generationRef.current) return;
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
      if (myGeneration !== generationRef.current) return;
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
