import type { HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError, useNavigation, isRouteErrorResponse } from "react-router";
import { useEffect } from "react";
import { ChatWidget } from "@nazmulcodes/shopify-admin-and-support-chat";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { mintSseToken } from "../lib/sse-token.server";
import { useShopAwareNavigate } from "../lib/use-shop-aware-navigate";
import { useSSEData } from "../hooks/use-sse-data";
import { useLiveEvents } from "../hooks/use-live-events";
import { useAppGateStore, type GateData } from "../stores/app-gate-store";

// Only auth blocks the response now — the billing/onboarding gate check and the
// alertsToday count used to be awaited here too (~400-1000ms on a cache miss,
// in front of every single /app/* page). They now run in the background via
// api.app-gate-stream.ts, identified by a short-lived token instead of a
// re-authenticated request (EventSource can't carry the session-token header).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const pathname = url.pathname;

  const isPublicRoute = pathname.startsWith("/app/billing") || pathname.startsWith("/app/onboarding");
  const token = await mintSseToken(shop);

  return { shop, token, isPublicRoute };
};


// Applied to a dynamic value's own wrapper (a plain span/div we render, never
// the s-* web component itself — its text lives in light DOM slotted
// content, so this cascades normally). The element keeps rendering its real
// markup with a placeholder/default value so its size matches the eventual
// real content (no layout shift); this class just hides that text and
// paints a pulsing gray bar over it. Remove the class once real data
// arrives — everything else about the element stays untouched.
const GLOBAL_STYLES = `
  @keyframes nav-spin { to { transform: rotate(360deg); } }
  @keyframes btn-spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }

  .skeleton-text {
    color: transparent !important;
    background-color: #e5e7eb;
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  .skeleton-text * { visibility: hidden; }
  .skeleton-text svg { display: none; }
`;

function GlobalStyles() {
  // dangerouslySetInnerHTML instead of a text child: <style> is a raw-text
  // HTML element (like <script>), so browsers never decode HTML entities
  // inside it. React's server renderer still escapes special characters
  // (e.g. an apostrophe becomes &#x27;) the way it would for any text node,
  // which the browser then keeps completely literal — causing a hydration
  // mismatch the moment this CSS contains a quote, apostrophe, or ampersand.
  // dangerouslySetInnerHTML writes the raw string with no escaping, which is
  // safe here since it's a hardcoded constant, never user input.
  return <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />;
}

function NavigationLoadingOverlay() {
  return (
    <div style={{
      position: "fixed",
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(255, 255, 255, 0.75)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: "36px",
          height: "36px",
          border: "3px solid #e4e5e7",
          borderTopColor: "#008060",
          borderRadius: "50%",
          animation: "nav-spin 0.8s linear infinite",
        }} />
        <div style={{ marginTop: "10px", fontSize: "13px", color: "#6d7175" }}>Loading…</div>
      </div>
    </div>
  );
}

export default function App() {
  const { shop, token, isPublicRoute } = useLoaderData<typeof loader>();

  const navigation = useNavigation();
  const isNavigating = navigation.state === "loading";

  // App Bridge (loaded once in app/root.tsx's <head>) dispatches this event when
  // s-link / s-app-nav components are clicked, so React Router can navigate
  // client-side instead of doing a full page reload.
  const navigate = useShopAwareNavigate();
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const href = (event.target as HTMLElement | null)?.getAttribute("href");
      if (href) navigate(href);
    };
    document.addEventListener("shopify:navigate", handleNavigate);
    return () => document.removeEventListener("shopify:navigate", handleNavigate);
  }, [navigate]);

  // Background gate check + alerts count — nav and <Outlet/> render immediately;
  // this resolves shortly after and bounces to onboarding/billing if needed.
  const { data: gate, error: gateError } = useSSEData<GateData>(
    `/api/app-gate-stream?token=${encodeURIComponent(token)}&isPublicRoute=${isPublicRoute ? "1" : "0"}`,
  );
  const alertsToday = gate?.alertsToday ?? 0;

  // One persistent push connection for the whole session — not per page —
  // since this component doesn't remount between /app/* pages (see
  // shouldRevalidate below). Feeds live-events-store, which every page's
  // useCachedSSEData call reads to decide whether its cached data is stale.
  useLiveEvents(!isPublicRoute);

  const setGateState = useAppGateStore((s) => s.setGateState);
  const setAppStatus = useAppGateStore((s) => s.setAppStatus);
  useEffect(() => { setGateState({ gate, gateError }); }, [gate, gateError, setGateState]);

  useEffect(() => {
    if (gate?.redirectTo) {
      setAppStatus("redirect");
      navigate(gate.redirectTo, { replace: true });
    } else if (gate || gateError) {
      setAppStatus("ready");
    }
  }, [gate, gateError, navigate, setAppStatus]);

  const appStatus = useAppGateStore((s) => s.appStatus);

  return (
    <AppProvider embedded={false}>
      <GlobalStyles />
      {(isNavigating || appStatus === "loading" || appStatus === "redirect") && <NavigationLoadingOverlay />}
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/alert-history">
          {alertsToday > 0 ? `Alert History (${alertsToday})` : "Alert History"}
        </s-link>
        <s-link href="/app/back-in-stock">Back in Stock</s-link>
        <s-link href="/app/suppliers">Suppliers</s-link>
        <s-link href="/app/purchase-orders">Purchase Orders</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/integrations">Integrations</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/billing">Billing</s-link>
      </s-app-nav>
      {/* Child routes (e.g. app._index.tsx's dashboard) read appStatus straight
          from useAppGateStore to hold their own skeleton while it's "loading"
          or "redirect", and only render real content once it's "ready" —
          instead of flashing full content right before a bounce to
          onboarding/billing. */}
      <Outlet />
      <ChatWidget shop={shop} />
      <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #f3f4f6", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "#d1d5db", margin: 0 }}>
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#d1d5db", textDecoration: "none" }}>Privacy Policy</a>
          {" · "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#d1d5db", textDecoration: "none" }}>Terms of Service</a>
          {" · "}
          <a href="mailto:nazmul291@gmail.com" style={{ color: "#d1d5db", textDecoration: "none" }}>Support</a>
        </p>
      </div>
    </AppProvider>
  );
}

function AuthRetry() {
  useEffect(() => { window.location.reload(); }, []);
  return null;
}

export function ErrorBoundary() {
  const error = useRouteError();
  const isNetworkError =
    error instanceof Error &&
    (error.message.includes("fetch failed") ||
      error.message.includes("no response available") ||
      error.message.includes("NetworkError") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ENOTFOUND"));
  if (isNetworkError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32, background: "#f9fafb" }}>
        <div style={{ maxWidth: 480, width: "100%", background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", padding: "40px 32px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#111827" }}>Connection Error</h2>
          <p style={{ margin: "0 0 24px", fontSize: 14, color: "#6b7280" }}>
            Unable to reach Shopify. This is usually a temporary network issue.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#008060", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Retry
          </button>
          <details style={{ marginTop: 20, textAlign: "left" }}>
            <summary style={{ fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>Error details</summary>
            <pre style={{ fontSize: 11, color: "#6b7280", marginTop: 8, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }

  // The Shopify library throws an empty Response (status 401/500, no body) when
  // session-token exchange fails — typically a race between two parallel first-load
  // requests after install. boundary.error() would show the literal string
  // "Handling response" in that case. A page reload retries the auth flow and
  // succeeds on the next attempt.
  // useEffect so the reload only runs in the browser — window is undefined during SSR.
  if (isRouteErrorResponse(error) && !error.data) {
    return <AuthRetry />;
  }

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);

// Skip re-running the billing/alerts check when the user clicks between pages
// inside the app. The layout re-validates only after form actions (billing or
// settings might have changed) or when entering /app from somewhere outside it.
export function shouldRevalidate({ actionResult, currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (actionResult !== undefined) return true;
  if (currentUrl.pathname.startsWith("/app/") && nextUrl.pathname.startsWith("/app/")) {
    return false;
  }
  return defaultShouldRevalidate;
}
