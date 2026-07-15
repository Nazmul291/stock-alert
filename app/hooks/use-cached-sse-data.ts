import { useEffect, useMemo } from "react";
import { useSSEData } from "./use-sse-data";
import { useLiveEventsStore } from "../stores/live-events-store";

// Wraps useSSEData with a cache-reuse layer: only opens a connection (and
// triggers the server's DB/GraphQL compute) when the store has no data yet,
// the requested dataset has changed (`key` differs — e.g. products page
// search/filter/pagination), or live-events-store says `topic` changed since
// this store's data was last fetched. Otherwise `buildUrl` is never even
// called — the page keeps rendering the store's existing cached data with
// zero network/DB calls.
//
// `key` is deliberately a caller-supplied identity string, NOT the literal
// fetch URL: every one of these routes embeds a freshly-minted, short-lived
// auth token in the URL, and that token rotates on every page mount (each
// page's loader reruns per navigation). Comparing raw URLs would treat that
// token rotation as "the dataset changed" and refetch on every single visit
// — exactly the redundant-call problem this hook exists to eliminate. `key`
// should describe only what's actually being requested (e.g. "" for a
// param-less page, or `${search}|${filter}|${after}` for a paginated one).
//
// `lastFetchedAt` is stamped (via the `fetchedAt` useMemo below) at the
// moment a fetch is decided on, before it actually starts — not after it
// resolves. That's what makes this race-free: if a webhook bumps the topic
// while this fetch is still in flight, the bump's timestamp will still be
// greater than this stamp, so the next staleness check correctly fires one
// more (harmless) refetch instead of silently missing the update.
export function useCachedSSEData<T>(
  key: string,
  buildUrl: () => string,
  topic: string,
  cachedData: T | null,
  cachedKey: string | null,
  lastFetchedAt: number,
  setSSEState: (state: {
    data: T | null;
    error: string | null;
    retry: () => void;
    lastFetchedAt: number;
    lastKey: string;
  }) => void,
): void {
  const liveVersion = useLiveEventsStore((s) => s.version[topic] ?? 0);
  const isStale = cachedData === null || key !== cachedKey || liveVersion > lastFetchedAt;

  const url = isStale ? buildUrl() : null;
  // Cache-busted in addition to the token already making each request
  // unique-ish: an intermediate cache (e.g. a CDN/proxy in front of the app)
  // can end up storing and replaying a response for a given URL regardless
  // of Cache-Control headers, and since this URL is deliberately reused
  // across every refetch within a page mount (see the `key` note above),
  // that would keep re-serving one mount's very first response forever.
  // Appending a fresh, unique query param per fetch attempt makes that
  // structurally impossible, whatever the cache's actual behavior is.
  // Computed together with fetchedAt (not two separate useMemo calls) so
  // they always describe the exact same fetch attempt.
  //
  // Keyed on `liveVersion`, not just `url`: if a second push event bumps
  // this topic again while an earlier fetch is still in flight (`isStale`
  // was already true, so `url` alone wouldn't change), this must still open
  // a brand-new request — otherwise the second event is silently absorbed
  // and whichever response the ORIGINAL, now-stale request eventually
  // returns is the only thing that ever gets applied, even if it takes far
  // longer than the update that superseded it. useSSEData's generation
  // guard then discards that stale request's late response once this one
  // supersedes it, so only the most recent attempt's result ever commits.
  const { fetchedAt, bustedUrl } = useMemo(() => {
    if (!url) return { fetchedAt: null as number | null, bustedUrl: null as string | null };
    const now = Date.now();
    const separator = url.includes("?") ? "&" : "?";
    return { fetchedAt: now, bustedUrl: `${url}${separator}_=${now}` };
    // liveVersion is intentionally a dependency purely to force
    // recomputation on every bump (see comment above); its value isn't used
    // in the computation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, liveVersion]);

  const { data, error, retry } = useSSEData<T>(bustedUrl);

  useEffect(() => {
    if (fetchedAt === null) return;
    // Still in flight (useSSEData resets to null on a new url) — don't
    // clobber the store's existing cached data with a transient null, or
    // the page would flash back to a loading state during a background
    // refresh instead of the silent swap-in this is meant to provide.
    if (data === null && error === null) return;

    // A more recent update — a direct patch (see products-store.ts's
    // applyInventoryDelta/applyOptimisticPatch) or another, newer fetch
    // attempt that already resolved — landed in the store after this fetch
    // started. Applying this response now would overwrite that fresher
    // data with an answer that was only current as of before it arrived.
    // useSSEData's generation guard stops most of these before they even
    // reach here, but a direct store patch bumps lastFetchedAt without
    // going through that hook at all, so this check is still needed.
    if (fetchedAt < lastFetchedAt) return;

    if (data !== null) {
      setSSEState({ data, error: null, retry, lastFetchedAt: fetchedAt, lastKey: key });
      return;
    }

    // A background refresh (cachedData was already present, same key) failed
    // — stay silent rather than blanking the page to an error screen over
    // data that's still perfectly good to keep showing. Deliberately doesn't
    // bump lastFetchedAt/lastKey here, so the next real change (or next
    // mount) is free to try again; only a true first-load/new-key failure
    // (no cache to fall back on) surfaces the error/retry UI.
    if (cachedData === null || key !== cachedKey) {
      setSSEState({ data: null, error, retry, lastFetchedAt: fetchedAt, lastKey: key });
    }
  }, [data, error, retry, fetchedAt, key, cachedData, cachedKey, setSSEState, topic, lastFetchedAt]);
}
