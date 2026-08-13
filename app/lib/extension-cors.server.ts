import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// Admin UI extensions render in a Shopify-hosted sandbox iframe, not this
// app's own origin — every fetch() call they make to these routes is a
// genuine cross-origin request from the browser's perspective, even though
// Shopify auto-attaches the same kind of session-token Authorization header
// App Bridge uses for the embedded app's own (same-origin) fetches. Every
// response — including error responses — needs these headers, or the
// browser discards it before the extension's JS ever sees the status/body.
// "*" is safe here (rather than reflecting the request's Origin) because
// these routes never rely on cookies — auth is entirely via the bearer
// token, which "*" doesn't expose to credentialed requests.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// React Router routes a request to `loader` unless its method is one of
// POST/PUT/PATCH/DELETE (see react-router's isMutationMethod) — OPTIONS
// preflight requests land on `loader` even for POST-only routes, so every
// extension-facing route needs to export a loader that calls this first.
export function extensionCorsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// Thin wrapper for the three extension-facing API routes: authenticates the
// same way every other route in this app does, runs `compute()`, and always
// attaches CORS headers — including on the 401 Response authenticate.admin()
// throws for an expired session token. use-sse-data.ts has to preserve that
// 401's retry header untouched for App Bridge's patched fetch to catch it;
// there's no such convention for extensions (they manage their own token
// refresh via auth.idToken()), so this only needs to make sure the response
// is actually readable cross-origin, not preserve any particular status.
export async function extensionJSON<T>(
  request: Request,
  compute: (ctx: { admin: AdminApiContext; shop: string }) => Promise<T>,
): Promise<Response> {
  try {
    const { admin, session } = await authenticate.admin(request);
    const data = await compute({ admin, shop: session.shop });
    return Response.json(data, { headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof Response) {
      const headers = new Headers(err.headers);
      for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
      return new Response(err.body, { status: err.status, statusText: err.statusText, headers });
    }
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}
