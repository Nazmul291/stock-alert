import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { resolveSseToken } from "../lib/sse-token.server";
import { singleShotSSE } from "../lib/sse.server";
import { getCachedHasActivePaymentOffline, getIsTestStore } from "../services/billing.server";
import { unauthenticated } from "../shopify.server";

// Background counterpart to app.onboarding.tsx's loader: checks whether the
// merchant already has an active subscription (→ skip to /app) or has finished
// every setup step (→ skip to /app/billing), the inverse of app.tsx's own gate.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const shop = token ? await resolveSseToken(token) : null;
  if (!shop) {
    return singleShotSSE(async () => {
      throw new Error("Session expired — please reload the page.");
    });
  }

  return singleShotSSE(async () => {
    const { admin } = await unauthenticated.admin(shop);
    const isTest = await getIsTestStore(admin, shop);

    const [hasActivePayment, setupProgress] = await Promise.all([
      getCachedHasActivePaymentOffline(shop, isTest),
      prisma.setupProgress.findUnique({ where: { shop } }),
    ]);

    if (hasActivePayment) return { redirectTo: "/app" };

    const allStepsDone =
      setupProgress?.appInstalled &&
      setupProgress?.globalSettingsConfigured &&
      setupProgress?.notificationsConfigured;
    if (allStepsDone) return { redirectTo: "/app/billing" };

    return { redirectTo: null as string | null };
  });
};
