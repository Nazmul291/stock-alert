import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { resolveSlackOAuthState, exchangeSlackCode } from "../lib/slack-oauth.server";
import prisma from "../db.server";
import { invalidateShopCache } from "../lib/shop-cache.server";

// Builds the direct admin.shopify.com embedded URL instead of redirecting to
// our own bare domain — the latter loads outside any iframe, so App Bridge's
// client-side "not embedded, bounce through /auth/session-token" mechanism
// kicks in, which can get stuck (observed getting stuck on Shopify's own
// session-token page). Decoding `host` and going straight to
// admin.shopify.com/.../apps/{apiKey}/... matches what Shopify's own
// getEmbeddedAppUrl() does (see @shopify/shopify-api's get-embedded-app-url.js
// — decodeHost is a plain atob()), just with our own path appended.
function embeddedAdminUrl(host: string, path: string, extra = ""): string {
  const decodedHost = Buffer.from(host, "base64").toString("utf-8");
  return `https://${decodedHost}/apps/${process.env.SHOPIFY_API_KEY}${path}${extra}`;
}

// Slack redirects here (in the new tab opened by the "Connect to Slack" link,
// outside any iframe) after the merchant approves.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const ctx = state ? await resolveSlackOAuthState(state) : null;
  if (!ctx || !code) {
    // No host to build a direct admin URL from — fall back to the bare app
    // URL; this is a rare edge case (expired/tampered state), not the common path.
    return redirect("/app/integrations?slack_error=1");
  }
  const { shop, host } = ctx;

  const backToApp = (extra = "") => embeddedAdminUrl(host, "/app/integrations", extra);
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/slack/callback`;

  try {
    const result = await exchangeSlackCode(code, redirectUri);
    if (!result.ok || !result.incoming_webhook || !result.access_token || !result.team) {
      console.error("[Slack OAuth] exchange failed:", result.error);
      return redirect(backToApp("?slack_error=1"));
    }

    const data = {
      slackWebhookUrl: result.incoming_webhook.url,
      slackTeamName: result.team.name,
      slackChannelName: result.incoming_webhook.channel,
      slackAccessToken: result.access_token,
      slackNotifications: true,
    };
    await prisma.storeSettings.upsert({
      where: { shop },
      update: data,
      create: { shop, ...data },
    });
    invalidateShopCache(shop);
  } catch (err) {
    console.error("[Slack OAuth] callback failed:", err);
    return redirect(backToApp("?slack_error=1"));
  }

  return redirect(backToApp());
};
