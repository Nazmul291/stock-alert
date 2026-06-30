import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – version skew between prisma-storage and shopify-app-react-router resolved at runtime
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

import { BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "./lib/billing-plans";
export { BILLING_PLAN_BASIC, BILLING_PLAN_PRO };

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.April26,
  scopes: process.env.SHOPIFY_SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    [BILLING_PLAN_BASIC]: {
      trialDays: 30,
      lineItems: [
        {
          amount: 3.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
    [BILLING_PLAN_PRO]: {
      trialDays: 30,
      lineItems: [
        {
          amount: 9.99,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.April26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const sessionStorage = shopify.sessionStorage;

// Two layers of deduplication prevent duplicate token exchanges:
//
// 1. WeakMap keyed on Request — React Router v7 passes the same Request object
//    to all concurrent loaders within one page load (layout + child routes), so
//    the exchange runs once per HTTP request regardless of how many loaders call
//    authenticate.admin(). WeakMap entries are GC'd with the Request object.
//
// 2. In-flight Map keyed on shop — covers truly separate HTTP requests that
//    arrive at the same time (e.g., iframe load + Shopify prefetch probe). The
//    second request awaits the same Promise as the first; when it resolves the
//    entry is removed so the next legitimate auth cycle works normally.

const _adminAuthCache = new WeakMap<Request, ReturnType<typeof shopify.authenticate.admin>>();
const _inflightByShop = new Map<string, ReturnType<typeof shopify.authenticate.admin>>();

export const authenticate: typeof shopify.authenticate = {
  ...shopify.authenticate,
  admin: (request: Request) => {
    // Layer 1: same Request object (same HTTP request, multiple loaders)
    if (_adminAuthCache.has(request)) return _adminAuthCache.get(request)!;

    // Layer 2: different Request objects but same shop (two concurrent requests)
    const shop = new URL(request.url).searchParams.get("shop") ?? "";
    if (shop && _inflightByShop.has(shop)) {
      const shared = _inflightByShop.get(shop)!;
      _adminAuthCache.set(request, shared);
      return shared;
    }

    const promise = shopify.authenticate.admin(request);
    _adminAuthCache.set(request, promise);
    if (shop) {
      _inflightByShop.set(shop, promise);
      // Clean up the in-flight entry on both success and failure.
      // Using .then(fn, fn) rather than .finally(fn).catch() avoids creating
      // an extra derived Promise that would become an unhandled rejection when
      // authenticate.admin rejects with a Response (its redirect signal).
      promise.then(
        () => _inflightByShop.delete(shop),
        () => _inflightByShop.delete(shop),
      );
    }
    return promise;
  },
};
