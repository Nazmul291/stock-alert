import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Generic single-shot JSON responder: runs `compute()` once and returns its
// result (or a caught error) as a plain JSON body. Unlike api.sync-stream.ts
// /api.live-stream.ts (which genuinely stream multiple events over time via
// real EventSource connections), the routes using this have no intermediate
// progress to report — they just move a query that used to block the page's
// document response into the background, then hand back one answer.
//
// This used to be served as a single-message SSE stream (hence callers named
// their payload `{type: "done"|"error", ...}`, which is preserved as-is so
// use-sse-data.ts's parsing didn't need to change). That was switched to a
// plain JSON response because repeatedly opening and closing short-lived
// EventSource connections (open → one message → close, once per filter/tab
// change) turned out to be fragile over a Cloudflare Tunnel with a small
// HA-connection pool: the first connection in a page mount would complete
// fine, but every connection after it could hang indefinitely with no
// message and no error — confirmed by instrumenting the connection lifecycle
// directly and comparing against a plain fetch() to the identical URL, which
// never hung. A plain request/response doesn't hold a connection open
// waiting to be reused, so it doesn't hit that failure mode.
export async function singleShotJSON<T>(compute: () => Promise<T>): Promise<Response> {
  let payload: { type: "done"; data: T } | { type: "error"; message: string };
  try {
    payload = { type: "done", data: await compute() };
  } catch (err) {
    // authenticate.admin() (called by authenticatedSingleShotJSON below)
    // signals an expired/invalid session token by throwing a 401 Response
    // carrying a retry header that App Bridge's patched fetch watches for,
    // to silently refresh the token and re-issue the request — the caller
    // never even sees this 401, as long as it reaches the browser as a real
    // Response. Swallowing it into a 200 JSON error here would hide that
    // status/header entirely and break that auto-recovery, so it must be
    // returned as-is rather than converted to our own error payload.
    if (err instanceof Response) return err;
    payload = { type: "error", message: err instanceof Error ? err.message : "Internal error" };
  }

  return Response.json(payload, {
    headers: {
      // no-store, not no-cache — no-cache still permits a cache to store the
      // response and serve it again after revalidating, which an
      // intermediate proxy (e.g. Cloudflare, sitting in front of this app)
      // can get wrong. use-cached-sse-data.ts deliberately reuses the exact
      // same URL for every refetch within a page's mount, so any caching here
      // would keep re-serving that mount's very first response forever, no
      // matter how many times the underlying data actually changes.
      "Cache-Control": "no-store",
    },
  });
}

// Thin wrapper shared by every single-shot data route (products, dashboard,
// settings, integrations, analytics, alert-history, back-in-stock,
// product-detail): authenticate the request exactly the way every page
// loader already does, then hand the resolved admin/shop straight to
// singleShotJSON — so each route is just "parse my own query params, call
// this". Not used by api.entry-stream.ts (runs pre-auth, before a shop is
// known) or api.live-stream.ts/api.sync-stream.ts (real multi-message
// EventSource streams, authenticated via the short-lived token from
// sse-token.server.ts since EventSource can't send an Authorization header).
export function authenticatedSingleShotJSON<T>(
  request: Request,
  compute: (ctx: { admin: AdminApiContext; shop: string }) => Promise<T>,
): Promise<Response> {
  return singleShotJSON(async () => {
    const { admin, session } = await authenticate.admin(request);
    return compute({ admin, shop: session.shop });
  });
}
