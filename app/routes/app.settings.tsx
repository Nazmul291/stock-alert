import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { Form, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { SSEErrorRetry } from "../components/Skeleton";
import type { SettingsData } from "../lib/settings-data.server";
import { useSSECacheStore } from "../hooks/use-sse-cache-store";
import { canUseFeature } from "../lib/plan-limits";
import { useSettingsStore, type SettingsStore } from "../stores/settings-store";
import { useLiveEventsStore } from "../stores/live-events-store";
import { PlanCard } from "../components/settings/PlanCard";
import { InventorySettingsSection } from "../components/settings/InventorySettingsSection";
import { EmailBrandingSection } from "../components/settings/EmailBrandingSection";
import { MonitoringScopeSection } from "../components/settings/MonitoringScopeSection";
import { EnterpriseReportingSection } from "../components/settings/EnterpriseReportingSection";
import { ThemeAppEmbedSection } from "../components/settings/ThemeAppEmbedSection";
import { DangerZoneSection } from "../components/settings/DangerZoneSection";
import { UnsavedChangesBar } from "../components/UnsavedChangesBar";

// Only the auth check blocks the response — settings data loads entirely in
// the background via api.settings-stream.ts (authenticated the same way as
// this loader, via App Bridge's automatic session-token fetch header) and is
// pushed to the client once ready.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "reset") {
    await prisma.$transaction([
      prisma.inventoryTracking.deleteMany({ where: { shop } }),
      prisma.alertHistory.deleteMany({ where: { shop } }),
    ]);
    return { intent: "reset", success: true, message: "All product data reset successfully." };
  }

  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";

  const bool = (key: string) => form.get(key) === "true";

  const rawThreshold = parseInt(form.get("lowStockThreshold") as string);

  const errors: Record<string, string> = {};

  if (isNaN(rawThreshold) || rawThreshold < 1 || rawThreshold > 1000) {
    errors.lowStockThreshold = "Threshold must be between 1 and 1,000.";
  }

  if (Object.keys(errors).length > 0) {
    return { intent: "save", success: false as const, errors };
  }

  const rawBrandColor = ((form.get("brandColor") as string) ?? "").trim();
  const rawLeadTime = parseInt((form.get("supplierLeadTimeDays") as string) ?? "7");
  const rawMonitoringFilter = form.get("monitoringFilter");
  const rawDeadStockThresholdDays = parseInt((form.get("deadStockThresholdDays") as string) ?? "60");
  const data = {
    autoHideEnabled: bool("autoHideEnabled"),
    autoRepublishEnabled: bool("autoRepublishEnabled"),
    lowStockThreshold: rawThreshold,
    supplierLeadTimeDays: !isNaN(rawLeadTime) && rawLeadTime >= 1 && rawLeadTime <= 90 ? rawLeadTime : 7,
    monitoringFilter:
      rawMonitoringFilter === "all" || rawMonitoringFilter === "collection" || rawMonitoringFilter === "tags"
        ? rawMonitoringFilter
        : "all",
    monitoringCollectionId: ((form.get("monitoringCollectionId") as string) ?? "").trim() || null,
    monitoringTags: ((form.get("monitoringTags") as string) ?? "").trim() || null,
    ...(canUseFeature(plan, "whiteLabelEmails") ? {
      brandLogoUrl: ((form.get("brandLogoUrl") as string) ?? "").trim() || null,
      brandColor: /^#[0-9a-fA-F]{6}$/.test(rawBrandColor) ? rawBrandColor : null,
      brandSenderName: ((form.get("brandSenderName") as string) ?? "").trim() || null,
    } : {}),
    ...(canUseFeature(plan, "coreLimitedEditionSections") ? {
      limitedEditionTag: ((form.get("limitedEditionTag") as string) ?? "").trim() || "limited-edition",
    } : {}),
    ...(canUseFeature(plan, "deadStockAlerts") ? {
      deadStockThresholdDays: [30, 60].includes(rawDeadStockThresholdDays) ? rawDeadStockThresholdDays : 60,
    } : {}),
  };

  const updated = await prisma.storeSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
  invalidateShopCache(shop);

  // Recompute from the FULL saved row, not just this page's fields —
  // app.integrations.tsx's action also writes slackWebhookUrl/whatsappPhone/
  // klaviyo*, so reading only this page's fields here would incorrectly clear
  // the flag if those were the only channels a merchant had configured.
  const hasNotifications = !!(
    updated.notificationEmail || updated.slackWebhookUrl || updated.whatsappPhone ||
    (updated.klaviyoEnabled && updated.klaviyoApiKey)
  );
  // Saving the settings page counts as "configured" regardless of whether the
  // user changed the threshold from the default — they actively chose their values.
  const isConfigured = true;

  await prisma.setupProgress.upsert({
    where: { shop },
    update: { globalSettingsConfigured: isConfigured, notificationsConfigured: hasNotifications },
    create: {
      shop,
      appInstalled: true,
      globalSettingsConfigured: isConfigured,
      notificationsConfigured: hasNotifications,
      productThresholdsConfigured: false,
      firstProductTracked: false,
    },
  });

  return { intent: "save", success: true, message: "Settings saved successfully." };
};

export default function SettingsPage() {
  useSSECacheStore<SettingsData, SettingsStore>(useSettingsStore, "", () => `/api/settings-stream`, "settings");

  // Gate on the store, not a local hook result — see the rule established
  // in dashboard-store.ts.
  const storeError = useSettingsStore((s) => s.error);
  const retry = useSettingsStore((s) => s.retry);

  return (
    <s-page heading="Settings" sub-heading="Configure your inventory monitoring preferences">
      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry ?? (() => {})} />
      ) : (
        <SettingsContent />
      )}

      {/* Static, doesn't depend on loaded settings */}
      <ThemeAppEmbedSection />
      <DangerZoneSection />
    </s-page>
  );
}

// Same defaults `loadSettingsData` returns for a shop with no stored
// settings row yet — used here as the placeholder while the SSE payload is
// still in flight, so the form seeds with a sensible starting point either way.
// Includes fields this page no longer edits (digest/alert-delivery — see
// Notification Center) because it shares SettingsData["settings"]'s full
// type with that page; only the ones actually rendered below get their own
// useState/handlers here.
const DEFAULT_SETTINGS: SettingsData["settings"] = {
  autoHideEnabled: false,
  autoRepublishEnabled: false,
  lowStockThreshold: 5,
  digestEnabled: true,
  digestFrequency: "weekly",
  digestTimezone: "UTC",
  digestHour: 8,
  digestDayOfWeek: 1,
  brandLogoUrl: "",
  brandColor: "#4f46e5",
  brandSenderName: "",
  supplierLeadTimeDays: 7,
  monitoringFilter: "all",
  monitoringCollectionId: "",
  monitoringTags: "",
  limitedEditionTag: "limited-edition",
  deadStockThresholdDays: 60,
  alertDeliveryMode: "daily",
  alertBatchHour: 23,
  lowStockMuted: false,
  outOfStockMuted: false,
  restockMuted: false,
};

// Always renders the real layout — read-only display values (PlanCard) read
// `loading` off the store themselves and apply `.skeleton-text` to their
// dynamic nodes. The fields below are editable/dirty-tracked form state, so
// they just seed from DEFAULT_SETTINGS until real data arrives (see the
// re-seed effect further down) — an <input> can't show a shimmering
// skeleton in place of its value the way a <span> can.
function SettingsContent() {
  const loading = useSettingsStore((s) => s.data === null);
  const plan = useSettingsStore((s) => s.data?.plan) ?? "basic";
  const settings = useSettingsStore((s) => s.data?.settings) ?? DEFAULT_SETTINGS;
  const saveFetcher = useFetcher<typeof action>();
  const saving = saveFetcher.state !== "idle";
  const [autoHideEnabled, setAutoHideEnabled] = useState(settings.autoHideEnabled);
  const [autoRepublishEnabled, setAutoRepublishEnabled] = useState(settings.autoRepublishEnabled);
  const [brandLogoUrl, setBrandLogoUrl] = useState(settings.brandLogoUrl);
  const [brandColor, setBrandColor] = useState(settings.brandColor);
  const [brandSenderName, setBrandSenderName] = useState(settings.brandSenderName);
  const [monitoringFilter, setMonitoringFilter] = useState(settings.monitoringFilter);
  const [monitoringCollectionId, setMonitoringCollectionId] = useState(settings.monitoringCollectionId);
  const [monitoringTags, setMonitoringTags] = useState(settings.monitoringTags);
  const [limitedEditionTag, setLimitedEditionTag] = useState(settings.limitedEditionTag);
  const [deadStockThresholdDays, setDeadStockThresholdDays] = useState(settings.deadStockThresholdDays);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // SettingsContent now mounts immediately (before this effect existed it
  // only mounted once real data was already in the store, so the useState
  // initializers above always ran against real values). Re-seed local form
  // state the moment loading flips from true to false so the form catches
  // up to the real settings instead of being stuck on DEFAULT_SETTINGS.
  useEffect(() => {
    if (loading) return;
    setAutoHideEnabled(settings.autoHideEnabled);
    setAutoRepublishEnabled(settings.autoRepublishEnabled);
    setBrandLogoUrl(settings.brandLogoUrl);
    setBrandColor(settings.brandColor);
    setBrandSenderName(settings.brandSenderName);
    setMonitoringFilter(settings.monitoringFilter);
    setMonitoringCollectionId(settings.monitoringCollectionId);
    setMonitoringTags(settings.monitoringTags);
    setLimitedEditionTag(settings.limitedEditionTag);
    setDeadStockThresholdDays(settings.deadStockThresholdDays);
    // Only re-seed on the loading -> loaded transition, not on every
    // settings identity change (e.g. an in-place SSE re-push), so it
    // doesn't clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function handleDiscard() {
    setAutoHideEnabled(settings.autoHideEnabled);
    setAutoRepublishEnabled(settings.autoRepublishEnabled);
    setBrandLogoUrl(settings.brandLogoUrl);
    setBrandColor(settings.brandColor);
    setBrandSenderName(settings.brandSenderName);
    setMonitoringFilter(settings.monitoringFilter);
    setMonitoringCollectionId(settings.monitoringCollectionId);
    setMonitoringTags(settings.monitoringTags);
    setLimitedEditionTag(settings.limitedEditionTag);
    setDeadStockThresholdDays(settings.deadStockThresholdDays);
    formRef.current?.reset();
    setIsDirty(false);
  }

  const saveData = saveFetcher.data;

  const saveErrors =
    saveData && saveData.intent === "save" && !saveData.success
      ? (saveData.errors as Record<string, string>)
      : null;

  const saveSuccess = saveData && saveData.intent === "save" && saveData.success;

  const bumpLiveEvents = useLiveEventsStore((s) => s.bump);
  useEffect(() => {
    const data = saveFetcher.data;
    if (data?.intent === "save" && data?.success) {
      setIsDirty(false);
      // No webhook writes storeSettings — this is the only source of change,
      // so invalidate the cache locally instead of wiring real SSE push for
      // a race that can't happen. See use-cached-sse-data.ts.
      bumpLiveEvents(["settings"]);
    }
  }, [saveFetcher.data, bumpLiveEvents]);

  function handleSave() {
    const fd = new FormData(formRef.current ?? undefined);
    // Set all state-controlled values explicitly — do not rely on DOM serialization
    fd.set("autoHideEnabled", autoHideEnabled ? "true" : "false");
    fd.set("autoRepublishEnabled", autoRepublishEnabled ? "true" : "false");
    fd.set("monitoringFilter", monitoringFilter);
    fd.set("monitoringCollectionId", monitoringCollectionId);
    fd.set("monitoringTags", monitoringTags);
    fd.set("brandLogoUrl", brandLogoUrl);
    fd.set("brandColor", brandColor || "#4f46e5");
    fd.set("brandSenderName", brandSenderName);
    fd.set("limitedEditionTag", limitedEditionTag);
    fd.set("deadStockThresholdDays", String(deadStockThresholdDays));
    saveFetcher.submit(fd, { method: "post" });
  }

  const canAutoRepublish = canUseFeature(plan, "autoRepublish");
  const canWhiteLabelEmails = canUseFeature(plan, "whiteLabelEmails");
  const canCoreLimitedEdition = canUseFeature(plan, "coreLimitedEditionSections");
  const canDeadStockAlerts = canUseFeature(plan, "deadStockAlerts");

  function markDirty() {
    setIsDirty(true);
  }

  return (
    <>
      {/* Toast-style success */}
      {isDirty && <div style={{ height: 57 }} />}

      {saveSuccess && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#065f46", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          {saveData?.message}
        </div>
      )}

      {saveErrors && Object.keys(saveErrors).length > 0 && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#991b1b", fontSize: 14 }}>
          <strong>Please fix the following before saving:</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {Object.values(saveErrors).map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </div>
      )}

      <PlanCard />

      <Form method="post" ref={formRef} onChange={markDirty}>
        <InventorySettingsSection
          canAutoRepublish={canAutoRepublish}
          autoHideEnabled={autoHideEnabled}
          autoRepublishEnabled={autoRepublishEnabled}
          onAutoHideChange={(v) => { setAutoHideEnabled(v); markDirty(); }}
          onAutoRepublishChange={(v) => { setAutoRepublishEnabled(v); markDirty(); }}
          lowStockThreshold={settings.lowStockThreshold}
          lowStockError={saveErrors?.lowStockThreshold}
          supplierLeadTimeDays={settings.supplierLeadTimeDays}
        />

        <div style={{ marginTop: 24 }}>
          <s-section heading="Alert Rules & Digest Schedule">
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>
              Moved to <s-link href="/app/notification-center">Notification Center</s-link> — choose which
              alerts to receive, delivery timing, and digest schedule there.
            </p>
          </s-section>
        </div>

        <EmailBrandingSection
          brandSenderName={brandSenderName}
          brandColor={brandColor}
          brandLogoUrl={brandLogoUrl}
          canWhiteLabelEmails={canWhiteLabelEmails}
          onBrandSenderNameChange={(v) => { setBrandSenderName(v); markDirty(); }}
          onBrandColorChange={(v) => { setBrandColor(v); markDirty(); }}
          onBrandLogoUrlChange={(v) => { setBrandLogoUrl(v); markDirty(); }}
        />

        <MonitoringScopeSection
          monitoringFilter={monitoringFilter}
          monitoringCollectionId={monitoringCollectionId}
          monitoringTags={monitoringTags}
          onMonitoringFilterChange={(v) => { setMonitoringFilter(v); markDirty(); }}
          onMonitoringCollectionIdChange={(v) => { setMonitoringCollectionId(v); markDirty(); }}
          onMonitoringTagsChange={(v) => { setMonitoringTags(v); markDirty(); }}
        />

        <EnterpriseReportingSection
          limitedEditionTag={limitedEditionTag}
          deadStockThresholdDays={deadStockThresholdDays}
          canCoreLimitedEdition={canCoreLimitedEdition}
          canDeadStockAlerts={canDeadStockAlerts}
          onLimitedEditionTagChange={(v) => { setLimitedEditionTag(v); markDirty(); }}
          onDeadStockThresholdDaysChange={(v) => { setDeadStockThresholdDays(v); markDirty(); }}
        />
      </Form>

      {isDirty && (
        <UnsavedChangesBar saving={saving} onDiscard={handleDiscard} onSave={handleSave} />
      )}
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
