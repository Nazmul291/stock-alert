import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { resolveAsanaOAuthState, mintAsanaOAuthState } from "../lib/asana-oauth.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";

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

  // The Integrations page already hides/locks this control for non-Pro shops,
  // but that's UI-only — this route is a plain top-level link a merchant could
  // hit directly, so the plan has to be re-checked server-side here too.
  const session = await getCachedSession(ctx.shop);
  if (!canUseFeature(session?.plan, "asanaTaskCreation")) {
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
  // No `scope` param here on purpose. GET /projects/{gid}/sections (used to
  // populate the per-event "Group" picker) isn't available under Asana's
  // granular Permission Scopes at all — it 400s with "Full permissions are
  // required to use this endpoint" regardless of which scopes are granted.
  // So this app is configured in Asana's developer console with "Full
  // permissions" (legacy default grant) instead of granular scopes — and
  // Asana rejects the authorize request as forbidden_scopes if a `scope`
  // param is present while the app is in that mode.

  return redirect(authorizeUrl.toString());
};
