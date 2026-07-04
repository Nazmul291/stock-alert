import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { resolveSseToken } from "../lib/sse-token.server";
import { singleShotSSE } from "../lib/sse.server";
import { getCachedHasActivePaymentOffline, getIsTestStore } from "../services/billing.server";
import { unauthenticated } from "../shopify.server";

const todayUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// Background counterpart to app.tsx's loader: the billing/onboarding gate check
// and the alertsToday count, run after the page shell has already been sent.
// Redirect decisions are returned as a bare path (not thrown) — the client
// performs the actual navigation via useShopAwareNavigate, which already knows
// how to preserve shop/host/embedded from the current URL.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const isPublicRoute = url.searchParams.get("isPublicRoute") === "1";

  const shop = token ? await resolveSseToken(token) : null;
  if (!shop) {
    return singleShotSSE(async () => {
      throw new Error("Session expired — please reload the page.");
    });
  }

  return singleShotSSE(async () => {
    const alertsToday = await prisma.alertHistory.count({
      where: { shop, sentAt: { gte: todayUTC() } },
    });

    let redirectTo: string | null = null;

    if (!isPublicRoute) {
      try {
        const setupProgress = await prisma.setupProgress.findUnique({ where: { shop } });

        if (!setupProgress) {
          // No record at all → brand-new install. Skip the billing API calls
          // and go straight to onboarding — they can't have a subscription yet.
          redirectTo = "/app/onboarding";
        } else {
          const { admin } = await unauthenticated.admin(shop);
          const isTest = await getIsTestStore(admin, shop);
          const hasActivePayment = await getCachedHasActivePaymentOffline(shop, isTest);
          if (!hasActivePayment) {
            const setupDone =
              setupProgress.appInstalled &&
              setupProgress.globalSettingsConfigured &&
              setupProgress.notificationsConfigured;
            redirectTo = setupDone ? "/app/billing" : "/app/onboarding";
          }
        }
      } catch {
        // Billing check failed — allow access rather than lock the merchant out
      }
    }

    return { redirectTo, alertsToday } satisfies { redirectTo: string | null; alertsToday: number };
  });
};
