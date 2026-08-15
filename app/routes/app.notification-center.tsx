import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Form, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, getCachedSettings, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { isValidDigestTimezone, DIGEST_TIMEZONES, WEEKDAY_OPTIONS, formatHourLabel } from "../lib/timezones";
import { getLowStockEmailTemplate } from "../lib/email-templates";
import { SSEErrorRetry } from "../components/Skeleton";
import type { SettingsData } from "../lib/settings-data.server";
import type { IntegrationsData } from "../lib/integrations-data.server";
import { useSSECacheStore } from "../hooks/use-sse-cache-store";
import { useSettingsStore, type SettingsStore } from "../stores/settings-store";
import { useIntegrationsStore, type IntegrationsStore } from "../stores/integrations-store";
import { useLiveEventsStore } from "../stores/live-events-store";
import { DigestEmailsSection } from "../components/settings/DigestEmailsSection";
import { AlertDeliverySection } from "../components/settings/AlertDeliverySection";
import { UnsavedChangesBar } from "../components/UnsavedChangesBar";

// Only the auth check blocks the response — settings/integrations data load
// entirely in the background via the same api.settings-stream.ts /
// api.integrations-stream.ts endpoints app.settings.tsx and
// app.integrations.tsx already use (see below), same SSE pattern. The one
// thing computed here is the Alert Preview: cheap and synchronous, so it's a
// plain loader value rather than a third SSE stream.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const settings = await getCachedSettings(shop);

  const preview = getLowStockEmailTemplate(
    {
      storeName: shop.replace(".myshopify.com", ""),
      shopDomain: shop,
      productTitle: "Sample Product",
      productId: "0",
      currentQuantity: 3,
      threshold: 10,
    },
    {
      logoUrl: settings?.brandLogoUrl ?? null,
      color: settings?.brandColor ?? null,
      senderName: settings?.brandSenderName ?? null,
    },
  );

  return { previewSubject: preview.subject, previewHtml: preview.html };
};

// Scoped to exactly the fields app.settings.tsx's action no longer touches
// (see its shrink) — the two actions never write overlapping StoreSettings
// columns, so there's exactly one save-path per field.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";
  const form = await request.formData();
  const bool = (key: string) => form.get(key) === "true";

  const clampHour = (raw: string | null, fallback: number) => {
    const n = parseInt(raw ?? "", 10);
    return !isNaN(n) && n >= 0 && n <= 23 ? n : fallback;
  };
  const clampWeekday = (raw: string | null, fallback: number) => {
    const n = parseInt(raw ?? "", 10);
    return !isNaN(n) && n >= 0 && n <= 6 ? n : fallback;
  };

  const rawDigestFrequency = form.get("digestFrequency") as string;
  const rawDigestTimezone = form.get("digestTimezone") as string;
  const rawAlertDeliveryMode = form.get("alertDeliveryMode") as string;

  const data = {
    digestEnabled: bool("digestEnabled"),
    digestFrequency: canUseFeature(plan, "dailyDigest") && rawDigestFrequency === "daily" ? "daily" : "weekly",
    digestTimezone: isValidDigestTimezone(rawDigestTimezone) ? rawDigestTimezone : "UTC",
    digestHour: clampHour(form.get("digestHour") as string, 8),
    digestDayOfWeek: clampWeekday(form.get("digestDayOfWeek") as string, 1),
    alertDeliveryMode: rawAlertDeliveryMode === "daily" ? "daily" : "instant",
    alertBatchHour: clampHour(form.get("alertBatchHour") as string, 23),
    lowStockMuted: bool("lowStockMuted"),
    outOfStockMuted: bool("outOfStockMuted"),
    restockMuted: bool("restockMuted"),
  };

  await prisma.storeSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
  invalidateShopCache(shop);

  return { success: true as const, message: "Notification settings saved." };
};

// Same defaults loadSettingsData/loadIntegrationsData return for a shop with
// no stored row yet — used as the placeholder while the SSE payloads are
// still in flight.
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

export default function NotificationCenterPage() {
  useSSECacheStore<SettingsData, SettingsStore>(useSettingsStore, "", () => `/api/settings-stream`, "settings");
  useSSECacheStore<IntegrationsData, IntegrationsStore>(useIntegrationsStore, "", () => `/api/integrations-stream`, "integrations");

  const settingsError = useSettingsStore((s) => s.error);
  const settingsRetry = useSettingsStore((s) => s.retry);
  const integrationsError = useIntegrationsStore((s) => s.error);
  const integrationsRetry = useIntegrationsStore((s) => s.retry);
  const storeError = settingsError ?? integrationsError;
  const retry = settingsError ? settingsRetry : integrationsRetry;

  return (
    <s-page heading="Notification Center" sub-heading="Alert rules, digest schedule, and delivery preview in one place">
      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry ?? (() => {})} />
      ) : (
        <NotificationCenterContent />
      )}
    </s-page>
  );
}

function NotificationCenterContent() {
  const { previewSubject, previewHtml } = useLoaderData<typeof loader>();
  const loading = useSettingsStore((s) => s.data === null);
  const plan = useSettingsStore((s) => s.data?.plan) ?? "basic";
  const settings = useSettingsStore((s) => s.data?.settings) ?? DEFAULT_SETTINGS;

  const integrationsLoading = useIntegrationsStore((s) => s.data === null);
  const emailEnabled = useIntegrationsStore((s) => s.data?.settings.emailNotifications) ?? false;
  const slackConnected = useIntegrationsStore((s) => s.data?.settings.slackConnected) ?? false;

  const saveFetcher = useFetcher<typeof action>();
  const saving = saveFetcher.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);

  const [digestEnabled, setDigestEnabled] = useState(settings.digestEnabled);
  const [digestFrequency, setDigestFrequency] = useState(settings.digestFrequency);
  const [digestTimezone, setDigestTimezone] = useState(settings.digestTimezone);
  const [digestHour, setDigestHour] = useState(settings.digestHour);
  const [digestDayOfWeek, setDigestDayOfWeek] = useState(settings.digestDayOfWeek);
  const [alertDeliveryMode, setAlertDeliveryMode] = useState(settings.alertDeliveryMode);
  const [alertBatchHour, setAlertBatchHour] = useState(settings.alertBatchHour);
  const [lowStockMuted, setLowStockMuted] = useState(settings.lowStockMuted);
  const [outOfStockMuted, setOutOfStockMuted] = useState(settings.outOfStockMuted);
  const [restockMuted, setRestockMuted] = useState(settings.restockMuted);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (loading) return;
    setDigestEnabled(settings.digestEnabled);
    setDigestFrequency(settings.digestFrequency);
    setDigestTimezone(settings.digestTimezone);
    setDigestHour(settings.digestHour);
    setDigestDayOfWeek(settings.digestDayOfWeek);
    setAlertDeliveryMode(settings.alertDeliveryMode);
    setAlertBatchHour(settings.alertBatchHour);
    setLowStockMuted(settings.lowStockMuted);
    setOutOfStockMuted(settings.outOfStockMuted);
    setRestockMuted(settings.restockMuted);
    // Only re-seed on the loading -> loaded transition — see app.settings.tsx's
    // identical comment on why this doesn't clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  function handleDiscard() {
    setDigestEnabled(settings.digestEnabled);
    setDigestFrequency(settings.digestFrequency);
    setDigestTimezone(settings.digestTimezone);
    setDigestHour(settings.digestHour);
    setDigestDayOfWeek(settings.digestDayOfWeek);
    setAlertDeliveryMode(settings.alertDeliveryMode);
    setAlertBatchHour(settings.alertBatchHour);
    setLowStockMuted(settings.lowStockMuted);
    setOutOfStockMuted(settings.outOfStockMuted);
    setRestockMuted(settings.restockMuted);
    formRef.current?.reset();
    setIsDirty(false);
  }

  const saveData = saveFetcher.data;
  const saveSuccess = saveData?.success === true;

  const bumpLiveEvents = useLiveEventsStore((s) => s.bump);
  useEffect(() => {
    if (saveFetcher.data?.success) {
      setIsDirty(false);
      bumpLiveEvents(["settings"]);
    }
  }, [saveFetcher.data, bumpLiveEvents]);

  function handleSave() {
    const fd = new FormData(formRef.current ?? undefined);
    fd.set("digestEnabled", digestEnabled ? "true" : "false");
    fd.set("digestFrequency", digestFrequency);
    fd.set("digestTimezone", digestTimezone);
    fd.set("digestHour", String(digestHour));
    fd.set("digestDayOfWeek", String(digestDayOfWeek));
    fd.set("alertDeliveryMode", alertDeliveryMode);
    fd.set("alertBatchHour", String(alertBatchHour));
    fd.set("lowStockMuted", lowStockMuted ? "true" : "false");
    fd.set("outOfStockMuted", outOfStockMuted ? "true" : "false");
    fd.set("restockMuted", restockMuted ? "true" : "false");
    saveFetcher.submit(fd, { method: "post" });
  }

  const canDailyDigest = canUseFeature(plan, "dailyDigest");

  function markDirty() {
    setIsDirty(true);
  }

  const tzLabel = DIGEST_TIMEZONES.find((tz) => tz.value === digestTimezone)?.label ?? digestTimezone;

  return (
    <>
      {isDirty && <div style={{ height: 57 }} />}

      {saveSuccess && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#065f46", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          {saveData?.message}
        </div>
      )}

      {/* Read-only — full channel configuration (API keys, phone numbers,
          webhook URLs) stays on Integrations; duplicating editable toggles
          here would create a second source of truth for the same booleans. */}
      <div style={{ marginBottom: 24 }}>
        <s-section heading="Delivery Channels">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "Email", enabled: emailEnabled },
              { label: "Slack", enabled: slackConnected },
            ].map((ch) => (
              <span
                key={ch.label}
                className={integrationsLoading ? "skeleton-text" : undefined}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600,
                  background: ch.enabled ? "#d1fae5" : "#f3f4f6",
                  color: ch.enabled ? "#065f46" : "#6b7280",
                }}
              >
                {ch.label} — {ch.enabled ? "Enabled" : "Disabled"}
              </span>
            ))}
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 10, marginBottom: 0 }}>
            Configure recipients, Slack workspace, WhatsApp, Klaviyo, Asana, and Shopify Flow on{" "}
            <s-link href="/app/integrations">Integrations</s-link>.
          </p>
        </s-section>
      </div>

      <Form method="post" ref={formRef} onChange={markDirty}>
        <DigestEmailsSection
          digestEnabled={digestEnabled}
          digestFrequency={digestFrequency}
          digestTimezone={digestTimezone}
          digestHour={digestHour}
          digestDayOfWeek={digestDayOfWeek}
          canDailyDigest={canDailyDigest}
          onDigestEnabledChange={(v) => { setDigestEnabled(v); markDirty(); }}
          onDigestFrequencyChange={(v) => { setDigestFrequency(v); markDirty(); }}
          onDigestTimezoneChange={(v) => { setDigestTimezone(v); markDirty(); }}
          onDigestHourChange={(v) => { setDigestHour(v); markDirty(); }}
          onDigestDayOfWeekChange={(v) => { setDigestDayOfWeek(v); markDirty(); }}
        />

        <AlertDeliverySection
          alertDeliveryMode={alertDeliveryMode}
          alertBatchHour={alertBatchHour}
          digestTimezone={digestTimezone}
          lowStockMuted={lowStockMuted}
          outOfStockMuted={outOfStockMuted}
          restockMuted={restockMuted}
          onAlertDeliveryModeChange={(v) => { setAlertDeliveryMode(v); markDirty(); }}
          onAlertBatchHourChange={(v) => { setAlertBatchHour(v); markDirty(); }}
          onLowStockMutedChange={(v) => { setLowStockMuted(v); markDirty(); }}
          onOutOfStockMutedChange={(v) => { setOutOfStockMuted(v); markDirty(); }}
          onRestockMutedChange={(v) => { setRestockMuted(v); markDirty(); }}
        />
      </Form>

      {/* Live recap of the *local* (possibly unsaved) form state, not the
          loaded snapshot — matches Reorder Planner's live-stat-card spirit. */}
      <div style={{ marginTop: 24 }}>
        <s-section heading="Schedule Summary">
          <p style={{ fontSize: 14, color: "#374151", margin: "0 0 6px" }}>
            <strong>Digest:</strong>{" "}
            {digestEnabled
              ? `${digestFrequency === "daily" ? "Daily" : `Weekly on ${WEEKDAY_OPTIONS[digestDayOfWeek].label}`} at ${formatHourLabel(digestHour)} (${tzLabel})`
              : "Off"}
          </p>
          <p style={{ fontSize: 14, color: "#374151", margin: 0 }}>
            <strong>Instant-alert batch:</strong>{" "}
            {alertDeliveryMode === "daily" ? `Daily at ${formatHourLabel(alertBatchHour)} (${tzLabel})` : "Off — sent immediately"}
          </p>
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Alert Preview">
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 0 }}>
            A sample low-stock email, rendered with your current branding — {previewSubject}
          </p>
          {previewHtml && (
            <iframe
              title="Alert email preview"
              srcDoc={previewHtml}
              sandbox=""
              style={{ width: "100%", height: 420, border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}
            />
          )}
        </s-section>
      </div>

      {isDirty && (
        <UnsavedChangesBar saving={saving} onDiscard={handleDiscard} onSave={handleSave} />
      )}
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
