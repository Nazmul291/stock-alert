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

// React Router v7 passes the same Request object to all concurrent loaders in
// a single page load (layout + child routes). Without deduplication, each
// loader that calls authenticate.admin() independently triggers its own token
// exchange when the session is missing or expired — resulting in duplicate DB
// writes and redundant Shopify API calls. Memoizing on the Request reference
// ensures the exchange runs exactly once per page load regardless of how many
// loaders participate.
const _adminAuthCache = new WeakMap<Request, ReturnType<typeof shopify.authenticate.admin>>();
export const authenticate: typeof shopify.authenticate = {
  ...shopify.authenticate,
  admin: (request: Request) => {
    if (!_adminAuthCache.has(request)) {
      _adminAuthCache.set(request, shopify.authenticate.admin(request));
    }
    return _adminAuthCache.get(request)!;
  },
};
