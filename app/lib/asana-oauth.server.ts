import { mintSseToken, resolveSseToken } from "./sse-token.server";

// Same reasoning as slack-oauth.server.ts — Shopify's authenticate.admin()
// requires both `shop` and `host` on any embedded document request, and
// Asana's OAuth `state` only round-trips a single opaque string, so both
// travel through it together.
export type AsanaOAuthContext = { shop: string; host: string };

export async function mintAsanaOAuthState(ctx: AsanaOAuthContext): Promise<string> {
  return mintSseToken(JSON.stringify(ctx), 600);
}

export async function resolveAsanaOAuthState(token: string): Promise<AsanaOAuthContext | null> {
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

type AsanaTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  data?: { gid: string; name: string; email: string };
  error?: string;
  error_description?: string;
};

// Unlike Slack's non-expiring bot token, Asana access tokens expire in ~1
// hour — exchange returns both the access token and a (effectively
// non-expiring, per Asana's docs) refresh token used by
// refreshAsanaAccessToken below.
export async function exchangeAsanaCode(code: string, redirectUri: string): Promise<{
  ok: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { gid: string; name: string; email: string };
}> {
  const res = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env.ASANA_CLIENT_ID ?? "",
      client_secret: process.env.ASANA_CLIENT_SECRET ?? "",
    }),
  });
  const json: AsanaTokenResponse = await res.json();
  if (!res.ok || !json.access_token) {
    return { ok: false, error: json.error_description ?? json.error ?? `Asana OAuth error ${res.status}` };
  }
  return {
    ok: true,
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in,
    user: json.data,
  };
}

// Asana may or may not rotate the refresh token on each use — callers should
// keep the existing one if this doesn't return a new one.
export async function refreshAsanaAccessToken(refreshToken: string): Promise<{
  ok: boolean;
  error?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const res = await fetch("https://app.asana.com/-/oauth_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.ASANA_CLIENT_ID ?? "",
      client_secret: process.env.ASANA_CLIENT_SECRET ?? "",
    }),
  });
  const json: AsanaTokenResponse = await res.json();
  if (!res.ok || !json.access_token) {
    return { ok: false, error: json.error_description ?? json.error ?? `Asana OAuth error ${res.status}` };
  }
  return { ok: true, access_token: json.access_token, refresh_token: json.refresh_token, expires_in: json.expires_in };
}
