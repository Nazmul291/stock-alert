import { useCallback, useEffect, useRef, useState } from "react";

// Generic counterpart to use-sync-stream.ts: fetches a single-shot JSON
// payload (`{type: "done", data}` or `{type: "error", message}` — see
// sse.server.ts's singleShotJSON) and exposes it as `data`/`error`. Used to
// load page data in the background instead of blocking the document
// response on it.
//
// This used to open an EventSource per fetch attempt instead of calling
// fetch() directly. That was fragile over a Cloudflare Tunnel: the first
// EventSource connection in a page mount would complete fine, but every
// connection after it (e.g. switching a filter tab, which reopens a fresh
// one) could hang indefinitely with no message and no error — confirmed by
// instrumenting the connection lifecycle directly. A plain fetch() to the
// identical URL never hung, so this switched transport instead of trying to
// work around EventSource's connection-reuse behavior.
export function useSSEData<T>(url: string | null) {
  // Tags each resolved data/error with the exact url it answers — rather
  // than resetting data/error to null in an effect (or during render) when
  // `url` changes. Either reset approach leaves data/error as this hook's
  // *previous* url's payload for at least one render after `url` changes:
  // an effect-based reset only lands on the render after the one that first
  // saw the new url, and even a same-render reset (calling setState
  // conditionally while rendering) doesn't survive React StrictMode's
  // double-invocation of this same render — the second invocation can still
  // observe the pre-reset value. use-cached-sse-data.ts's caller reads `key`
  // (already reflecting the new url) alongside this hook's data in that
  // window; if data still belongs to the old url, its effect fires anyway
  // (on `key` changing) and commits the *old* filter's rows to the store
  // under the *new* filter's key, which flips this hook's `url` prop back
  // to null next render and aborts the real in-flight request before it can
  // ever resolve. Comparing `state.forUrl` to the current `url` on every
  // render — a plain value comparison, immune to render-timing/StrictMode
  // quirks — means a mismatch (new url, not-yet-resolved) always reads back
  // as null, however many times this render gets replayed.
  const [state, setState] = useState<{ forUrl: string | null; data: T | null; error: string | null }>({
    forUrl: null,
    data: null,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  // Bumped once per fetch attempt (every effect run) — a resolved fetch only
  // applies its result if it's still the most recent attempt. Needed because
  // this effect can now re-run multiple times per mount (use-cached-sse-data.ts
  // reopens a fetch whenever a live-push event marks the page stale), and a
  // slow, superseded fetch's response arriving after a newer one already
  // committed would otherwise silently overwrite fresh data with stale data.
  // AbortController already prevents most of these from resolving at all,
  // but this is a second, cheap guard for the rest.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!url) return;

    const myGeneration = ++generationRef.current;
    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then((res) => {
        // A non-2xx here means singleShotJSON's compute threw a raw Response
        // rather than returning our own {type, ...} JSON payload (e.g.
        // authenticate.admin()'s 401 session-token-retry signal — see
        // sse.server.ts). App Bridge's fetch patch already tries to recover
        // that transparently before this promise resolves; if it still
        // couldn't, there's no {type,...} body to parse, so surface a plain
        // failure instead of trying (and failing) to read one.
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((payload) => {
        if (myGeneration !== generationRef.current) return;
        if (payload.type === "done") {
          setState({ forUrl: url, data: payload.data as T, error: null });
        } else if (payload.type === "error") {
          setState({ forUrl: url, data: null, error: payload.message ?? "Failed to load." });
        }
      })
      .catch((err) => {
        if (myGeneration !== generationRef.current) return;
        // Expected on cleanup (filter/url change, unmount) — not a real failure.
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ forUrl: url, data: null, error: "Connection lost. Please retry." });
      });

    return () => {
      controller.abort();
    };
  }, [url, nonce]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, data: null, error: null }));
    setNonce((n) => n + 1);
  }, []);

  const isCurrent = state.forUrl === url;
  return { data: isCurrent ? state.data : null, error: isCurrent ? state.error : null, retry };
}
