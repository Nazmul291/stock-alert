import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { resolveSlackOAuthState, mintSlackOAuthState } from "../lib/slack-oauth.server";

// Hit via a plain <a target="_blank"> link from app.integrations.tsx — opened
// in a new tab, not a fetch — since Slack's OAuth consent screen can't render
// inside the Shopify admin iframe. `token` was minted by that page's own
// (already Shopify-authenticated) loader, so this route can trust the shop
// without redoing Shopify auth itself (a plain top-level nav can't carry a
// session token the way an App Bridge fetch can).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const ctx = token ? await resolveSlackOAuthState(token) : null;
  if (!ctx) {
    return redirect("/app/integrations?slack_error=1");
  }

  // Fresh, independently-scoped state for this specific Slack round-trip —
  // still carries {shop, host}, needed at the very end to redirect back into
  // the embedded app (authenticate.admin requires both params or it bounces
  // to /auth/login instead of the lightweight iframe re-embed).
  const state = await mintSlackOAuthState(ctx);
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/slack/callback`;

  const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
  authorizeUrl.searchParams.set("client_id", process.env.SLACK_CLIENT_ID ?? "");
  authorizeUrl.searchParams.set("scope", "incoming-webhook");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  return redirect(authorizeUrl.toString());
};
