import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { ChatWidget } from "@nazmulcodes/shopify-admin-and-support-chat";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import prisma from "../db.server";
import { getIsTestStore } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const pathname = url.pathname;

  const isPublicRoute = pathname.startsWith("/app/billing") || pathname.startsWith("/app/onboarding");

  if (!isPublicRoute) {
    try {
      const isTest = await getIsTestStore(admin);
      const { hasActivePayment } = await billing.check({
        plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
        isTest,
      });
      if (!hasActivePayment) {
        // Preserve embedded/host/shop so App Bridge can detect the iframe context
        // and escape it properly before any redirect to admin.shopify.com
        const params = new URLSearchParams();
        const host = url.searchParams.get("host");
        const embedded = url.searchParams.get("embedded") ?? "1";
        if (host) params.set("host", host);
        if (shop) params.set("shop", shop);
        params.set("embedded", embedded);

        // If setup is not yet complete, go through onboarding first
        const setupProgress = await prisma.setupProgress.findUnique({ where: { shop: session.shop } });
        const setupDone = setupProgress?.appInstalled && setupProgress?.globalSettingsConfigured && setupProgress?.notificationsConfigured;
        const dest = setupDone ? "/app/billing" : "/app/onboarding";
        throw redirect(`${dest}?${params.toString()}`);
      }
    } catch (err) {
      if (err instanceof Response) throw err;
      // Billing check failed — allow access rather than lock merchant out
    }
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "", shop };
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/billing">Billing</s-link>
      </s-app-nav>
      <Outlet />
      <ChatWidget shop={shop} />
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
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
