import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { resolveAsanaOAuthState, mintAsanaOAuthState } from "../lib/asana-oauth.server";

// Hit via a plain <a target="_blank"> link from app.integrations.tsx — opened
// in a new tab, not a fetch — since Asana's OAuth consent screen can't render
// inside the Shopify admin iframe. `token` was minted by that page's own
// (already Shopify-authenticated) loader, so this route can trust the shop
// without redoing Shopify auth itself — same pattern as api.slack.connect.tsx.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const ctx = token ? await resolveAsanaOAuthState(token) : null;
  // `host` is required to build the embedded admin.shopify.com redirect at
  // the end of the round-trip (see api.asana.callback.tsx's embeddedAdminUrl)
  // — if the Integrations page was loaded without it (e.g. hit outside the
  // normal embedded Shopify admin iframe), bail out now rather than
  // completing an OAuth grant we can't cleanly return the merchant from.
  if (!ctx || !ctx.host) {
    return redirect("/app/integrations?asana_error=1");
  }

  // Fresh, independently-scoped state for this specific Asana round-trip —
  // still carries {shop, host}, needed at the very end to redirect back into
  // the embedded app.
  const state = await mintAsanaOAuthState(ctx);
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/asana/callback`;

  const authorizeUrl = new URL("https://app.asana.com/-/oauth_authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", process.env.ASANA_CLIENT_ID ?? "");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  // Required once the app is configured with granular Permission Scopes in
  // Asana's developer console (rather than the legacy default/identity
  // grant) — omitting this causes Asana to fall back to requesting default
  // identity scopes, which such apps are no longer allowed to request,
  // surfacing as a "forbidden_scopes" error. There's no standalone
  // "sections" scope — GET /projects/{gid}/sections is covered by
  // projects:read and POST /sections/{gid}/addTask by tasks:write (see
  // https://developers.asana.com/docs/oauth-scopes), so these five plus
  // users:read/workspaces:read are everything this app needs.
  authorizeUrl.searchParams.set(
    "scope",
    "users:read workspaces:read projects:read tasks:read tasks:write",
  );

  return redirect(authorizeUrl.toString());
};
