import { useEffect } from "react";
import { useLiveEventsStore } from "../stores/live-events-store";
import { useProductsStore, type InventoryDelta } from "../stores/products-store";

// Opens one persistent SSE connection for the whole session — mounted once in
// app.tsx, which doesn't remount between /app/* pages — and forwards each
// push event's topics into live-events-store. use-cached-sse-data.ts reads
// that store to decide whether a page's cached Zustand data is stale.
//
// Mints its own token (via /api/live-token) before the initial connect and
// before every reconnect, rather than relying on EventSource's native
// auto-reconnect replaying a token that may have expired by the time a
// long-lived connection drops (e.g. a Fly proxy idle-disconnect).
export function useLiveEvents(enabled: boolean): void {
  const bump = useLiveEventsStore((s) => s.bump);
  const applyInventoryDelta = useProductsStore((s) => s.applyInventoryDelta);

  useEffect(() => {
    if (!enabled) return;

    // Scoped to this effect invocation, not a shared ref — React's dev-mode
    // double-invoke (mount -> cleanup -> mount) would otherwise let the
    // second invocation's reset of a *shared* cancellation flag "revive" the
    // first invocation's in-flight connect(), leaving two live connections
    // instead of one.
    let cancelled = false;
    let es: EventSource | null = null;

    const connect = async () => {
      if (cancelled) return;
      try {
        const res = await fetch("/api/live-token");
        if (!res.ok) throw new Error(`token mint failed: ${res.status}`);
        const { token } = await res.json();
        if (cancelled) return;

        es = new EventSource(`/api/live-stream?token=${encodeURIComponent(token)}`);

        es.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data);
            let topics: string[] = Array.isArray(payload.topics) ? payload.topics : [];

            const delta = payload.delta as InventoryDelta | undefined;
            if (delta?.productId && delta?.variantId) {
              applyInventoryDelta(delta);
              // Already patched the row in place above — the "products"
              // topic's full refetch would be redundant now. dashboard/
              // analytics still need it since their aggregates (rankings,
              // counts) can't be reconstructed from a single-row delta.
              topics = topics.filter((t) => t !== "products");
            }

            if (topics.length > 0) bump(topics);
          } catch (err) {
            console.error("[use-live-events] malformed message:", e.data, err);
          }
        };

        es.onerror = (err) => {
          console.error("[use-live-events] connection error:", err);
          es?.close();
          es = null;
          if (!cancelled) setTimeout(connect, 3000);
        };
      } catch (err) {
        console.error("[use-live-events] connect() failed:", err);
        if (!cancelled) setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      cancelled = true;
      es?.close();
      es = null;
    };
  }, [enabled, bump, applyInventoryDelta]);
}
