import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { resolveAsanaOAuthState, exchangeAsanaCode } from "../lib/asana-oauth.server";
import { fetchWorkspaces } from "../lib/asana.server";
import prisma from "../db.server";
import { invalidateShopCache } from "../lib/shop-cache.server";

// Same admin.shopify.com direct-embed trick as api.slack.callback.tsx — see
// that file's comment for why (avoids App Bridge's client-side re-embed
// bounce getting stuck).
function embeddedAdminUrl(host: string, path: string, extra = ""): string {
  const decodedHost = Buffer.from(host, "base64").toString("utf-8");
  return `https://${decodedHost}/apps/${process.env.SHOPIFY_API_KEY}${path}${extra}`;
}

// Asana redirects here (in the new tab opened by the "Connect to Asana" link,
// outside any iframe) after the merchant approves.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const ctx = state ? await resolveAsanaOAuthState(state) : null;
  if (!ctx || !code) {
    return redirect("/app/integrations?asana_error=1");
  }
  const { shop, host } = ctx;

  const backToApp = (extra = "") => embeddedAdminUrl(host, "/app/integrations", extra);
  const redirectUri = `${process.env.SHOPIFY_APP_URL}/api/asana/callback`;

  try {
    const result = await exchangeAsanaCode(code, redirectUri);
    if (!result.ok || !result.access_token || !result.refresh_token || !result.user) {
      console.error("[Asana OAuth] exchange failed:", result.error);
      return redirect(backToApp("?asana_error=1"));
    }

    const workspaces = await fetchWorkspaces(result.access_token);
    const firstWorkspace = workspaces[0];
    if (!firstWorkspace) {
      console.error("[Asana OAuth] account has no workspaces");
      return redirect(backToApp("?asana_error=1"));
    }

    const data = {
      asanaEnabled: true,
      asanaAccessToken: result.access_token,
      asanaRefreshToken: result.refresh_token,
      asanaTokenExpiresAt: new Date(Date.now() + (result.expires_in ?? 3600) * 1000),
      asanaUserName: result.user.name,
      asanaWorkspaceGid: firstWorkspace.gid,
      asanaWorkspaceName: firstWorkspace.name,
    };
    await prisma.storeSettings.upsert({
      where: { shop },
      update: data,
      create: { shop, ...data },
    });
    invalidateShopCache(shop);
  } catch (err) {
    console.error("[Asana OAuth] callback failed:", err);
    return redirect(backToApp("?asana_error=1"));
  }

  return redirect(backToApp());
};
