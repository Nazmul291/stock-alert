import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, redirect, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const pathname = url.pathname;

  const isPublicRoute = pathname.startsWith("/app/billing") || pathname.startsWith("/app/onboarding");

  if (!isPublicRoute) {
    try {
      const { hasActivePayment } = await billing.check({
        plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
        isTest: process.env.TEST_PAYMENT === "true",
      });
      if (!hasActivePayment) {
        // Preserve embedded/host/shop so App Bridge can detect the iframe context
        // and escape it properly before any redirect to admin.shopify.com
        const params = new URLSearchParams();
        const host = url.searchParams.get("host");
        const shop = url.searchParams.get("shop");
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

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/products">Products</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/billing">Billing</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
