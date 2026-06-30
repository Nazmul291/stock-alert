import type { HeadersFunction, LoaderFunctionArgs, ShouldRevalidateFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError, useNavigation, isRouteErrorResponse } from "react-router";
import { useEffect } from "react";
import { ChatWidget } from "@nazmulcodes/shopify-admin-and-support-chat";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedHasActivePayment, getIsTestStore } from "../services/billing.server";
import { embeddedRedirectPath } from "../lib/embedded-redirect.server";
import { useShopAwareNavigate } from "../lib/use-shop-aware-navigate";

const todayUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const pathname = url.pathname;

  const isPublicRoute = pathname.startsWith("/app/billing") || pathname.startsWith("/app/onboarding");

  // Runs concurrently with the billing check below instead of after it — it
  // doesn't depend on that result, so there's no reason to block on it first.
  const alertsTodayPromise = prisma.alertHistory.count({
    where: { shop, sentAt: { gte: todayUTC() } },
  });
  // Suppress the "unhandled rejection" warning if a redirect below abandons
  // this promise before it's awaited; the real await further down still throws.
  alertsTodayPromise.catch(() => {});

  if (!isPublicRoute) {
    try {
      const isTest = await getIsTestStore(admin, shop);
      const hasActivePayment = await getCachedHasActivePayment(shop, isTest, billing);
      if (!hasActivePayment) {
        // If setup is not yet complete, go through onboarding first
        const setupProgress = await prisma.setupProgress.findUnique({ where: { shop: session.shop } });
        const setupDone = setupProgress?.appInstalled && setupProgress?.globalSettingsConfigured && setupProgress?.notificationsConfigured;
        const dest = setupDone ? "/app/billing" : "/app/onboarding";
        // Preserve embedded/host/shop so App Bridge can detect the iframe context
        // and escape it properly before any redirect to admin.shopify.com
        throw redirect(embeddedRedirectPath(request, dest, shop));
      }
    } catch (err) {
      if (err instanceof Response) throw err;
      // Billing check failed — allow access rather than lock merchant out
    }
  }

  const alertsToday = await alertsTodayPromise;

  return { shop, alertsToday };
};


function GlobalStyles() {
  return (
    <style>{`
      @keyframes nav-spin { to { transform: rotate(360deg); } }
      @keyframes btn-spin { to { transform: rotate(360deg); } }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
    `}</style>
  );
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
  const { shop, alertsToday } = useLoaderData<typeof loader>();

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

  return (
    <AppProvider embedded={false}>
      <GlobalStyles />
      {isNavigating && <NavigationLoadingOverlay />}
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/alert-history">
          {alertsToday > 0 ? `Alert History (${alertsToday})` : "Alert History"}
        </s-link>
        <s-link href="/app/back-in-stock">Back in Stock</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/billing">Billing</s-link>
      </s-app-nav>
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
  if (isRouteErrorResponse(error) && !error.data) {
    window.location.reload();
    return null;
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
