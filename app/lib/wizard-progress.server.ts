import type { Plan } from "@prisma/client";
import prisma from "../db.server";
import { getCachedSession } from "./shop-cache.server";

export type WizardProgress = {
  termsAccepted: boolean;
  onboardingDone: boolean;
  hasPlan: boolean;
  activePlan: Plan | null;
};

// Drives both app.tsx's nav-hide decision (every /app/* page) and
// app._index.tsx's step selection. Deliberately DB-only — no Shopify Admin
// API calls — since session.plan is already kept in sync by the
// app_subscriptions/update webhook and the billing confirm action (see
// app.billing._index.tsx), so this is just two cheap, cached lookups instead
// of the ~400-1000ms billing.check() round trip the old SSE gate stream did.
export async function getWizardProgress(shop: string): Promise<WizardProgress> {
  const [setupProgress, session] = await Promise.all([
    prisma.setupProgress.findUnique({ where: { shop } }),
    getCachedSession(shop),
  ]);

  return {
    termsAccepted: setupProgress?.termsAccepted ?? false,
    onboardingDone: !!(setupProgress?.globalSettingsConfigured && setupProgress?.notificationsConfigured),
    hasPlan: session?.plan != null,
    activePlan: session?.plan ?? null,
  };
}
