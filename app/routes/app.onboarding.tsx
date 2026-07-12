import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useNavigation, redirect } from "react-router";
import { useEffect } from "react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSettings, getCachedShopEmail } from "../lib/shop-cache.server";
import { embeddedRedirectPath } from "../lib/embedded-redirect.server";
import { mintSseToken } from "../lib/sse-token.server";
import { useSSEData } from "../hooks/use-sse-data";
import { useShopAwareNavigate } from "../lib/use-shop-aware-navigate";
import { OnboardingStepIndicator } from "../components/onboarding/OnboardingStepIndicator";
import { OnboardingConfirmStep } from "../components/onboarding/OnboardingConfirmStep";
import { OnboardingSettingsStep } from "../components/onboarding/OnboardingSettingsStep";

// The hasActivePayment / allStepsDone redirect gate used to be awaited here
// (isTestStore + billing.check, both Shopify API calls) before any of the step
// content below could render. It now runs in the background via
// api.onboarding-gate-stream.ts — the step form renders immediately and bounces
// client-side if the gate resolves to a redirect.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, ownerEmail] = await Promise.all([
    getCachedSettings(shop),
    getCachedShopEmail(shop),
  ]);

  const url = new URL(request.url);
  const step = Math.min(2, Math.max(1, parseInt(url.searchParams.get("step") ?? "1")));

  const displayName = shop
    .replace(".myshopify.com", "")
    .split("-")
    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  const shopInfo = { name: displayName, email: ownerEmail ?? "", domain: shop };

  const existingSettings = {
    lowStockThreshold: settings?.lowStockThreshold ?? 5,
    autoHideEnabled: settings?.autoHideEnabled ?? false,
    autoRepublishEnabled: settings?.autoRepublishEnabled ?? false,
  };

  const token = await mintSseToken(shop);

  return { step, shopInfo, existingSettings, token };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "confirm_install") {
    await prisma.setupProgress.upsert({
      where: { shop },
      update: { appInstalled: true },
      create: {
        shop,
        appInstalled: true,
        globalSettingsConfigured: false,
        notificationsConfigured: false,
        productThresholdsConfigured: false,
        firstProductTracked: false,
      },
    });
    return redirect(embeddedRedirectPath(request, "/app/onboarding", shop, { step: "2" }));
  }

  if (intent === "save_settings") {
    const data = {
      lowStockThreshold: parseInt(form.get("lowStockThreshold") as string) || 5,
      autoHideEnabled: form.get("autoHideEnabled") === "true",
      autoRepublishEnabled: form.get("autoRepublishEnabled") === "true",
    };

    // Auto-set notification email from the shop's owner email
    const notificationEmail = await getCachedShopEmail(shop);

    await prisma.storeSettings.upsert({
      where: { shop },
      update: { ...data, emailNotifications: true, notificationEmail },
      create: { shop, ...data, emailNotifications: true, notificationEmail },
    });
    await prisma.setupProgress.upsert({
      where: { shop },
      update: { globalSettingsConfigured: true, notificationsConfigured: true },
      create: {
        shop,
        appInstalled: true,
        globalSettingsConfigured: true,
        notificationsConfigured: true,
        productThresholdsConfigured: false,
        firstProductTracked: false,
      },
    });
    return redirect(embeddedRedirectPath(request, "/app/billing", shop));
  }

  return null;
};

const STEP_TITLES = ["Welcome to Stock Alert!", "Configure inventory settings"];
const STEP_SUBTITLES = [
  "Let's confirm your store details before we get started.",
  "Set your low-stock threshold and automation preferences.",
];

export default function OnboardingPage() {
  const { step, shopInfo, existingSettings, token } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  const navigate = useShopAwareNavigate();
  const { data: gate } = useSSEData<{ redirectTo: string | null }>(
    `/api/onboarding-gate-stream?token=${encodeURIComponent(token)}`,
  );
  useEffect(() => {
    if (gate?.redirectTo) navigate(gate.redirectTo, { replace: true });
  }, [gate, navigate]);

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: "#008060", padding: "28px 32px 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px", marginBottom: 16 }}>
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>✦ STOCK ALERT SETUP</span>
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#fff" }}>{STEP_TITLES[step - 1]}</h1>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{STEP_SUBTITLES[step - 1]}</p>
        </div>

        <OnboardingStepIndicator step={step} />

        {/* Step content */}
        <div style={{ padding: "32px" }}>
          {step === 1 && <OnboardingConfirmStep shopInfo={shopInfo} submitting={submitting} />}
          {step === 2 && <OnboardingSettingsStep existingSettings={existingSettings} submitting={submitting} />}
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
