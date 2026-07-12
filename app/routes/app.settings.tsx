import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Form, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { SettingsData } from "../lib/settings-data.server";
import { useSSEData } from "../hooks/use-sse-data";
import { canUseFeature } from "../lib/plan-limits";
import { useSettingsStore } from "../stores/settings-store";
import { SettingsSkeleton } from "../components/settings/SettingsSkeleton";
import { PlanCard } from "../components/settings/PlanCard";
import { InventorySettingsSection } from "../components/settings/InventorySettingsSection";
import { DigestEmailsSection } from "../components/settings/DigestEmailsSection";
import { EmailBrandingSection } from "../components/settings/EmailBrandingSection";
import { MonitoringScopeSection } from "../components/settings/MonitoringScopeSection";
import { ThemeAppEmbedSection } from "../components/settings/ThemeAppEmbedSection";
import { DangerZoneSection } from "../components/settings/DangerZoneSection";
import { UnsavedChangesBar } from "../components/UnsavedChangesBar";

// Only the auth check blocks the response — settings data loads entirely in
// the background via api.settings-stream.ts and is pushed to the client over
// SSE once ready. loadSettingsData itself lives in
// app/lib/settings-data.server.ts, not here — see app._index.tsx's loader
// comment for why a plain exported function can't stay in a route file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const token = await mintSseToken(shop);
  return { token };
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

  const rawDigestFrequency = form.get("digestFrequency") as string;
  const rawBrandColor = ((form.get("brandColor") as string) ?? "").trim();
  const rawLeadTime = parseInt((form.get("supplierLeadTimeDays") as string) ?? "7");
  const data = {
    autoHideEnabled: bool("autoHideEnabled"),
    autoRepublishEnabled: bool("autoRepublishEnabled"),
    lowStockThreshold: rawThreshold,
    digestEnabled: bool("digestEnabled"),
    digestFrequency: canUseFeature(plan, "dailyDigest") && rawDigestFrequency === "daily" ? "daily" : "weekly",
    supplierLeadTimeDays: !isNaN(rawLeadTime) && rawLeadTime >= 1 && rawLeadTime <= 90 ? rawLeadTime : 7,
    monitoringFilter: (["all", "collection", "tags"] as const).includes(form.get("monitoringFilter") as any) ? form.get("monitoringFilter") as string : "all",
    monitoringCollectionId: ((form.get("monitoringCollectionId") as string) ?? "").trim() || null,
    monitoringTags: ((form.get("monitoringTags") as string) ?? "").trim() || null,
    ...(canUseFeature(plan, "whiteLabelEmails") ? {
      brandLogoUrl: ((form.get("brandLogoUrl") as string) ?? "").trim() || null,
      brandColor: /^#[0-9a-fA-F]{6}$/.test(rawBrandColor) ? rawBrandColor : null,
      brandSenderName: ((form.get("brandSenderName") as string) ?? "").trim() || null,
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
  const { token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<SettingsData>(
    `/api/settings-stream?token=${encodeURIComponent(token)}`,
  );

  const setSSEState = useSettingsStore((s) => s.setSSEState);
  useEffect(() => { setSSEState({ data, error, retry }); }, [data, error, retry, setSSEState]);

  // Gate on the store, not the local `data`/`error` above — see the rule
  // established in dashboard-store.ts.
  const storeData = useSettingsStore((s) => s.data);
  const storeError = useSettingsStore((s) => s.error);

  return (
    <s-page heading="Settings" sub-heading="Configure your inventory monitoring preferences">
      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry} />
      ) : storeData ? (
        <SettingsContent />
      ) : (
        <SettingsSkeleton />
      )}

      {/* Static, doesn't depend on loaded settings */}
      <ThemeAppEmbedSection />
      <DangerZoneSection />
    </s-page>
  );
}

function SettingsContent() {
  const { plan, settings } = useSettingsStore((s) => s.data!);
  const saveFetcher = useFetcher<typeof action>();
  const saving = saveFetcher.state !== "idle";
  const [autoHideEnabled, setAutoHideEnabled] = useState(settings.autoHideEnabled);
  const [autoRepublishEnabled, setAutoRepublishEnabled] = useState(settings.autoRepublishEnabled);
  const [digestEnabled, setDigestEnabled] = useState(settings.digestEnabled);
  const [digestFrequency, setDigestFrequency] = useState(settings.digestFrequency);
  const [brandLogoUrl, setBrandLogoUrl] = useState(settings.brandLogoUrl);
  const [brandColor, setBrandColor] = useState(settings.brandColor);
  const [brandSenderName, setBrandSenderName] = useState(settings.brandSenderName);
  const [monitoringFilter, setMonitoringFilter] = useState(settings.monitoringFilter);
  const [monitoringCollectionId, setMonitoringCollectionId] = useState(settings.monitoringCollectionId);
  const [monitoringTags, setMonitoringTags] = useState(settings.monitoringTags);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleDiscard() {
    setAutoHideEnabled(settings.autoHideEnabled);
    setAutoRepublishEnabled(settings.autoRepublishEnabled);
    setDigestEnabled(settings.digestEnabled);
    setDigestFrequency(settings.digestFrequency);
    setBrandLogoUrl(settings.brandLogoUrl);
    setBrandColor(settings.brandColor);
    setBrandSenderName(settings.brandSenderName);
    setMonitoringFilter(settings.monitoringFilter);
    setMonitoringCollectionId(settings.monitoringCollectionId);
    setMonitoringTags(settings.monitoringTags);
    formRef.current?.reset();
    setIsDirty(false);
  }

  const saveData = saveFetcher.data as any;

  const saveErrors =
    saveData && saveData.intent === "save" && !saveData.success
      ? (saveData.errors as Record<string, string>)
      : null;

  const saveSuccess = saveData && saveData.intent === "save" && saveData.success;

  useEffect(() => {
    const data = saveFetcher.data as any;
    if (data?.intent === "save" && data?.success) setIsDirty(false);
  }, [saveFetcher.data]);

  function handleSave() {
    const fd = new FormData(formRef.current ?? undefined);
    // Set all state-controlled values explicitly — do not rely on DOM serialization
    fd.set("autoHideEnabled", autoHideEnabled ? "true" : "false");
    fd.set("autoRepublishEnabled", autoRepublishEnabled ? "true" : "false");
    fd.set("digestEnabled", digestEnabled ? "true" : "false");
    fd.set("digestFrequency", digestFrequency);
    fd.set("monitoringFilter", monitoringFilter);
    fd.set("monitoringCollectionId", monitoringCollectionId);
    fd.set("monitoringTags", monitoringTags);
    fd.set("brandLogoUrl", brandLogoUrl);
    fd.set("brandColor", brandColor || "#4f46e5");
    fd.set("brandSenderName", brandSenderName);
    saveFetcher.submit(fd, { method: "post" });
  }

  const canAutoRepublish = canUseFeature(plan, "autoRepublish");
  const canDailyDigest = canUseFeature(plan, "dailyDigest");
  const canWhiteLabelEmails = canUseFeature(plan, "whiteLabelEmails");

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

        <DigestEmailsSection
          digestEnabled={digestEnabled}
          digestFrequency={digestFrequency}
          canDailyDigest={canDailyDigest}
          onDigestEnabledChange={(v) => { setDigestEnabled(v); markDirty(); }}
          onDigestFrequencyChange={(v) => { setDigestFrequency(v); markDirty(); }}
        />

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
      </Form>

      {isDirty && (
        <UnsavedChangesBar saving={saving} onDiscard={handleDiscard} onSave={handleSave} />
      )}
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
