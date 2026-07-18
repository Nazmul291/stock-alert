import { useEffect, useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, useNavigation, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { useCachedSSEData } from "../hooks/use-cached-sse-data";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { mintSseToken } from "../lib/sse-token.server";
import { getCachedSettings, getCachedShopEmail } from "../lib/shop-cache.server";
import { getWizardProgress } from "../lib/wizard-progress.server";
import { requestPlanSubscription } from "../lib/billing-request.server";
import type { PlanKey } from "../lib/billing-plans";
import type { DashboardData } from "../lib/dashboard-data.server";
import { useDashboardStore } from "../stores/dashboard-store";
import { useWizardProgressStore } from "../stores/wizard-progress-store";
import { SSEErrorRetry } from "../components/Skeleton";
import { SetupChecklist } from "../components/dashboard/SetupChecklist";
import { InventoryOverviewSection } from "../components/dashboard/InventoryOverviewSection";
import { StockOutSoonBanner } from "../components/dashboard/StockOutSoonBanner";
import { ReadyForReorderBanner } from "../components/dashboard/ReadyForReorderBanner";
import { canUseFeature, getPlanLimits } from "../lib/plan-limits";
import { ProductsAtRiskSection } from "../components/dashboard/ProductsAtRiskSection";
import { RecentAlertsSection } from "../components/dashboard/RecentAlertsSection";
import { DashboardSyncButton } from "../components/dashboard/DashboardSyncButton";
import { OnboardingCard } from "../components/onboarding/OnboardingCard";
import { TermsAcceptanceStep } from "../components/onboarding/TermsAcceptanceStep";
import { OnboardingConfirmStep } from "../components/onboarding/OnboardingConfirmStep";
import { OnboardingSettingsStep } from "../components/onboarding/OnboardingSettingsStep";
import { OnboardingStepIndicator } from "../components/onboarding/OnboardingStepIndicator";
import { PlanSelectionStep } from "../components/billing/PlanSelectionStep";

// Only the auth check blocks the response — dashboard data is fetched entirely
// in the background by api.dashboard-stream.ts, identified by a short-lived
// token (EventSource can't carry the session-token auth header), and pushed to
// the client over SSE the moment it's ready. loadDashboardData itself lives in
// app/lib/dashboard-data.server.ts (not here) — React Router only strips
// server-only code from `loader`/`action`/`headers`/`middleware`, so any other
// export from a route file (like a plain helper function) gets pulled into the
// client bundle too, dragging in server-only modules like db.server with it.
//
// This is also where the terms/onboarding/plan wizard lives — see the
// component below. wizard-progress.server.ts (shared with app.tsx, which
// uses it to decide whether to hide the nav menu) is DB-only, so computing
// it here on every load costs nothing worth avoiding.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const progress = await getWizardProgress(shop);

  // shopInfo/existingSettings only feed the onboarding sub-steps below —
  // skip the extra cached lookups once onboarding is actually done, since
  // that's the steady-state case (every dashboard load after setup).
  const needsOnboardingData = !progress.onboardingDone;

  const [token, settings, ownerEmail] = await Promise.all([
    mintSseToken(shop),
    needsOnboardingData ? getCachedSettings(shop) : Promise.resolve(null),
    needsOnboardingData ? getCachedShopEmail(shop) : Promise.resolve(null),
  ]);

  const shopInfo = needsOnboardingData
    ? {
        name: shop.replace(".myshopify.com", "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        email: ownerEmail ?? "",
        domain: shop,
      }
    : null;
  const existingSettings = needsOnboardingData
    ? {
        lowStockThreshold: settings?.lowStockThreshold ?? 5,
        autoHideEnabled: settings?.autoHideEnabled ?? false,
        autoRepublishEnabled: settings?.autoRepublishEnabled ?? false,
      }
    : null;

  return { shop, token, progress, shopInfo, existingSettings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const auth = await authenticate.admin(request);
  const { session } = auth;
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "accept_terms") {
    await prisma.setupProgress.upsert({
      where: { shop },
      update: { termsAccepted: true, termsAcceptedAt: new Date() },
      create: {
        shop,
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        appInstalled: true,
        globalSettingsConfigured: false,
        notificationsConfigured: false,
        productThresholdsConfigured: false,
        firstProductTracked: false,
      },
    });
    return null;
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
        termsAccepted: true,
        appInstalled: true,
        globalSettingsConfigured: true,
        notificationsConfigured: true,
        productThresholdsConfigured: false,
        firstProductTracked: false,
      },
    });
    return null;
  }

  if (intent === "select_plan") {
    return requestPlanSubscription(auth, form.get("plan") as string);
  }

  return null;
};

export default function Dashboard() {
  const { shop, token, progress: loaderProgress, shopInfo, existingSettings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";

  // Hydrate the shared store from this route's own loader data on every
  // mount/revalidation — app.tsx hydrates the same store from its own copy
  // of this same DB-only check, so a step completed here shows up in its
  // nav-hide decision immediately (see below), not just after its own next
  // revalidation. patchProgress calls below (on submit, before the server
  // round trip resolves) are what make that "immediately" real — without
  // them this would show last-render's data for one frame after each step,
  // since the store doesn't otherwise know a step completed until this
  // effect re-runs with fresh loader data.
  const setProgress = useWizardProgressStore((s) => s.setProgress);
  useEffect(() => { setProgress(loaderProgress); }, [loaderProgress, setProgress]);
  const patchProgress = useWizardProgressStore((s) => s.patchProgress);
  const storeProgress = useWizardProgressStore((s) => s.progress);
  const progress = storeProgress ?? loaderProgress;

  // Which of the two onboarding sub-steps (confirm info / settings) is
  // showing. Purely local — neither sub-step needs a DB flag of its own,
  // since accepting terms already marks the install confirmed and only the
  // settings sub-step actually persists anything (globalSettingsConfigured).
  const [onboardingStep, setOnboardingStep] = useState<1 | 2>(1);

  if (!progress.termsAccepted) {
    return (
      <OnboardingCard title="Welcome to Stock Alert!" subtitle="Let's confirm a few things before we get started.">
        <TermsAcceptanceStep submitting={submitting} onSubmit={() => patchProgress({ termsAccepted: true })} />
      </OnboardingCard>
    );
  }

  if (!progress.onboardingDone) {
    return (
      <OnboardingCard
        title={onboardingStep === 1 ? "Confirm your store details" : "Configure inventory settings"}
        subtitle={onboardingStep === 1 ? "Let's confirm your store details before we get started." : "Set your low-stock threshold and automation preferences."}
      >
        <OnboardingStepIndicator step={onboardingStep} />
        {onboardingStep === 1 && shopInfo && (
          <OnboardingConfirmStep shopInfo={shopInfo} onContinue={() => setOnboardingStep(2)} />
        )}
        {onboardingStep === 2 && existingSettings && (
          <OnboardingSettingsStep
            existingSettings={existingSettings}
            submitting={submitting}
            onSubmit={() => patchProgress({ onboardingDone: true })}
          />
        )}
      </OnboardingCard>
    );
  }

  if (!progress.hasPlan) {
    return (
      <PlanSelectionStep
        activePlan={(progress.activePlan ?? null) as PlanKey | null}
        error={actionData && "error" in actionData ? actionData.error : null}
      />
    );
  }

  return <DashboardShell shop={shop} token={token} />;
}

// Split out from Dashboard() so its dashboard-data SSE connection (which
// triggers a real backend aggregation query) only opens once the wizard is
// actually done — Dashboard()'s early-return branches above never mount
// this, so a merchant still on the terms/onboarding/plan steps costs
// nothing on the dashboard-stream endpoint.
function DashboardShell({ shop, token }: { shop: string; token: string }) {
  const setLoaderData = useDashboardStore((s) => s.setLoaderData);
  useEffect(() => { setLoaderData({ shop }); }, [shop, setLoaderData]);

  const cachedData = useDashboardStore((s) => s.data);
  const cachedKey = useDashboardStore((s) => s.lastKey);
  const lastFetchedAt = useDashboardStore((s) => s.lastFetchedAt);
  const setSSEState = useDashboardStore((s) => s.setSSEState);
  useCachedSSEData<DashboardData>(
    "",
    () => `/api/dashboard-stream?token=${encodeURIComponent(token)}`,
    "dashboard",
    cachedData,
    cachedKey,
    lastFetchedAt,
    setSSEState,
  );

  const retry = useDashboardStore((s) => s.retry);
  const storeError = useDashboardStore((s) => s.error);

  return (
    <s-page heading="Dashboard" sub-heading="Monitor your inventory and alerts">
      {/* suppressHydrationWarning: s-button is a Shopify Polaris web
          component that injects its own `style` attribute during server
          rendering, outside anything declared in this JSX — React's
          hydration diff otherwise flags that as a false-positive mismatch.
          The generated JSX type for this custom element doesn't extend
          React's base DOM attributes (so it doesn't know about this prop),
          even though React honors it on any element at runtime. */}
      {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
      <s-button slot="primary-action" variant="primary" href="/app/products" suppressHydrationWarning>
        Manage Products
      </s-button>

      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry ?? (() => {})} />
      ) : (
        <DashboardContent />
      )}
    </s-page>
  );
}

// Always renders the real layout — descendants read `loading` off the store
// themselves and apply the shared `.skeleton-text` class to just their
// dynamic value nodes, so there's a single markup tree for both states
// instead of a separate skeleton component to keep in sync.
function DashboardContent() {
  const shop = useDashboardStore((s) => s.shop);
  const data = useDashboardStore((s) => s.data);
  const loading = !data;

  const syncFetcher = useFetcher<{ status?: string; error?: string }>();
  const { syncPct, syncStreamError, clearError, openStream } = useSyncStream(shop ?? "", data?.syncRunning ?? false);

  useEffect(() => {
    if (syncFetcher.data?.status === "started") openStream();
  }, [syncFetcher.data, openStream]);

  const plan = data?.plan ?? "basic";
  const progressPct = data?.progressPct ?? 0;
  const notificationEmail = data?.notificationEmail ?? null;
  const atRiskProducts = data?.atRiskProducts ?? [];
  const stockOutSoonCount = data?.stockOutSoonCount ?? 0;
  const readyForReorderCount = data?.readyForReorderCount ?? 0;
  const canManagePurchaseOrders = canUseFeature(plan, "purchaseOrders");
  const planLimits = getPlanLimits(plan);

  const syncActionError = syncPct === null && syncFetcher.state === "idle" ? (syncFetcher.data?.error ?? null) : null;
  const syncError = syncStreamError ?? syncActionError;

  return (
    <>
      {/* Setup checklist — held back until data confirms setup is actually
          incomplete, rather than reserving space on every load; most
          merchants complete setup once and shouldn't see this flash back in
          on every reload. */}
      {(!loading && progressPct < 100) && (
        <SetupChecklist
          syncPct={syncPct}
          syncSubmitting={syncFetcher.state !== "idle"}
          onSync={() => {
            if (syncPct === null && syncFetcher.state === "idle")
              syncFetcher.submit({ intent: "sync" }, { method: "post", action: "/app/products" });
          }}
        />
      )}

      <InventoryOverviewSection />

      {/* Held back until data confirms it's actually needed, same reasoning
          as the setup checklist above — most loads won't need this, so
          don't reserve space for it by default. */}
      {(!loading && stockOutSoonCount > 0) && <StockOutSoonBanner />}

      {(!loading && canManagePurchaseOrders && readyForReorderCount > 0) && <ReadyForReorderBanner />}

      {/* Unlike the two above, this one renders during loading too (showing
          its own internal skeleton — see ProductsAtRiskSection.tsx's
          PLACEHOLDER_ROWS) and only disappears once data confirms there's
          genuinely nothing at risk, matching RecentAlertsSection's
          always-mounted strategy below. */}
      {(loading || atRiskProducts.length > 0) && <ProductsAtRiskSection />}

      <RecentAlertsSection />

      {/* Store info */}
      <s-section heading="Store Information" slot="aside">
        <s-paragraph><strong>Shop:</strong> {shop}</s-paragraph>
        <s-paragraph>
          <strong>Plan:</strong>{" "}
          <span
            className={loading ? "skeleton-text" : undefined}
            style={{
              background: plan === "enterprise" ? "#ede9fe" : plan === "pro" ? "#d1fae5" : "#dbeafe",
              color: plan === "enterprise" ? "#5b21b6" : plan === "pro" ? "#065f46" : "#1e40af",
              padding: "1px 8px", borderRadius: 12, fontSize: 12,
            }}
          >
            {planLimits.name}
          </span>
        </s-paragraph>
        {(loading || notificationEmail) && (
          <s-paragraph>
            <strong>Alert Email:</strong>{" "}
            <span className={loading ? "skeleton-text" : undefined}>{notificationEmail || "name@example.com"}</span>
          </s-paragraph>
        )}
      </s-section>

      {/* Quick actions */}
      <s-section heading="Quick Actions" slot="aside">
        <s-stack direction="block" gap="base">
          <DashboardSyncButton
            pct={syncPct}
            submitting={syncFetcher.state !== "idle"}
            onClick={() => { if (syncPct === null && syncFetcher.state === "idle") syncFetcher.submit({ intent: "sync" }, { method: "post", action: "/app/products" }); }}
          />
          {syncError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 12px" }}>
              <p style={{ fontSize: 12, color: "#991b1b", margin: "0 0 8px" }}>{syncError}</p>
              <button
                type="button"
                onClick={() => {
                  clearError();
                  if (syncFetcher.state === "idle") syncFetcher.submit({ intent: "sync" }, { method: "post", action: "/app/products" });
                }}
                style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", cursor: "pointer", fontWeight: 600 }}
              >
                Retry
              </button>
            </div>
          )}
          {/* suppressHydrationWarning on these s-button elements: see the comment above the "Manage Products" button. */}
          {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
          <s-button href="/app/settings" suppressHydrationWarning>Configure Settings</s-button>
          {plan !== "enterprise" && (
            // @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type
            <s-button href="/app/billing" suppressHydrationWarning>{plan === "pro" ? "Upgrade to Enterprise" : "Upgrade Plan"}</s-button>
          )}
        </s-stack>
      </s-section>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
