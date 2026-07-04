import { mintSseToken, resolveSseToken } from "./sse-token.server";

// Shopify's authenticate.admin() requires BOTH `shop` and `host` on any
// embedded document request — validate-shop-and-host-params.js redirects to
// /auth/login if `host` is missing, even when `shop` is present and valid.
// Slack's OAuth `state` only round-trips a single opaque string, so both
// values need to travel through it together (redirect_uri itself must stay
// static — it can't carry per-shop data, see api.slack.connect.tsx).
export type SlackOAuthContext = { shop: string; host: string };

export async function mintSlackOAuthState(ctx: SlackOAuthContext): Promise<string> {
  return mintSseToken(JSON.stringify(ctx), 600);
}

export async function resolveSlackOAuthState(token: string): Promise<SlackOAuthContext | null> {
  const raw = await resolveSseToken(token);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.shop === "string" && typeof parsed?.host === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

// Wraps the two Slack Web API calls needed for the "Connect to Slack" OAuth 2.0
// flow. The incoming_webhook.url returned on success is a normal Incoming
// Webhook URL — it's stored as `slackWebhookUrl` and sent through exactly the
// same `new IncomingWebhook(...)` call in app/lib/notifications.ts as before;
// nothing about how alerts are sent changes, only how that URL is obtained.
export async function exchangeSlackCode(code: string, redirectUri: string): Promise<{
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name: string };
  incoming_webhook?: { url: string; channel: string; configuration_url: string };
}> {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      client_id: process.env.SLACK_CLIENT_ID ?? "",
      client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
    }),
  });
  return res.json();
}

// Best-effort — called when a merchant disconnects, so the app is also
// uninstalled from Slack's side. A failure here (e.g. already-revoked token)
// shouldn't block clearing the local settings.
export async function revokeSlackToken(accessToken: string): Promise<void> {
  try {
    await fetch("https://slack.com/api/auth.revoke", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (err) {
    console.error("[Slack OAuth] auth.revoke failed:", err);
  }
}
