import { useState, useRef, useEffect, Suspense } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Form, useFetcher, Await } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendTestNotification } from "../lib/notifications";
import { getCachedSettings, getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { SkeletonBlock } from "../components/Skeleton";

type SettingsValues = {
  autoHideEnabled: boolean;
  autoRepublishEnabled: boolean;
  lowStockThreshold: number;
  emailNotifications: boolean;
  slackNotifications: boolean;
  notificationEmail: string;
  slackWebhookUrl: string;
  whatsappNotifications: boolean;
  whatsappPhone: string;
  whatsappPhoneNumberId: string;
  whatsappAccessToken: string;
  digestEnabled: boolean;
  digestFrequency: string;
  brandLogoUrl: string;
  brandColor: string;
  brandSenderName: string;
  outboundWebhookUrl: string;
  supplierLeadTimeDays: number;
  monitoringFilter: string;
  monitoringCollectionId: string;
  monitoringTags: string;
};

type SettingsData = {
  shop: string;
  plan: string;
  storeEmail: string | null;
  settings: SettingsValues;
};

// Only the auth check blocks the response — the two settings/session lookups
// are kicked off but not awaited, so the page shell (plan card + form
// skeleton) streams immediately while the real form fills in once ready.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  return { settingsData: loadSettingsData(shop) };
};

async function loadSettingsData(shop: string): Promise<SettingsData> {
  const [settings, storeSession] = await Promise.all([
    getCachedSettings(shop),
    getCachedSession(shop),
  ]);

  return {
    shop,
    plan: storeSession?.plan ?? "basic",
    storeEmail: storeSession?.email ?? null,
    settings: settings
      ? {
          autoHideEnabled: settings.autoHideEnabled,
          autoRepublishEnabled: settings.autoRepublishEnabled,
          lowStockThreshold: settings.lowStockThreshold,
          emailNotifications: settings.emailNotifications,
          slackNotifications: settings.slackNotifications,
          notificationEmail: settings.notificationEmail ?? "",
          slackWebhookUrl: settings.slackWebhookUrl ?? "",
          whatsappNotifications: settings.whatsappNotifications,
          whatsappPhone: settings.whatsappPhone ?? "",
          whatsappPhoneNumberId: settings.whatsappPhoneNumberId ?? "",
          whatsappAccessToken: settings.whatsappAccessToken ?? "",
          digestEnabled: settings.digestEnabled,
          digestFrequency: settings.digestFrequency,
          brandLogoUrl: settings.brandLogoUrl ?? "",
          brandColor: settings.brandColor ?? "#4f46e5",
          brandSenderName: settings.brandSenderName ?? "",
          outboundWebhookUrl: settings.outboundWebhookUrl ?? "",
          supplierLeadTimeDays: settings.supplierLeadTimeDays ?? 7,
          monitoringFilter: settings.monitoringFilter ?? "all",
          monitoringCollectionId: settings.monitoringCollectionId ?? "",
          monitoringTags: settings.monitoringTags ?? "",
        }
      : {
          autoHideEnabled: false,
          autoRepublishEnabled: false,
          lowStockThreshold: 5,
          emailNotifications: true,
          slackNotifications: false,
          notificationEmail: "",
          slackWebhookUrl: "",
          whatsappNotifications: false,
          whatsappPhone: "",
          whatsappPhoneNumberId: "",
          whatsappAccessToken: "",
          digestEnabled: true,
          digestFrequency: "weekly",
          brandLogoUrl: "",
          brandColor: "#4f46e5",
          brandSenderName: "",
          outboundWebhookUrl: "",
          supplierLeadTimeDays: 7,
          monitoringFilter: "all",
          monitoringCollectionId: "",
          monitoringTags: "",
        },
  };
}

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

  if (intent === "test_notification") {
    const [settings, storeSession] = await Promise.all([
      getCachedSettings(shop),
      getCachedSession(shop),
    ]);
    if (!settings) {
      return { intent: "test_notification", testResult: { error: "Save your settings first before sending a test." } };
    }
    const testResult = await sendTestNotification(
      { shop, plan: storeSession?.plan ?? "basic", email: storeSession?.email ?? null },
      {
        emailNotifications: settings.emailNotifications,
        slackNotifications: settings.slackNotifications,
        notificationEmail: settings.notificationEmail,
        slackWebhookUrl: settings.slackWebhookUrl,
        whatsappNotifications: settings.whatsappNotifications,
        whatsappPhone: settings.whatsappPhone,
        whatsappPhoneNumberId: settings.whatsappPhoneNumberId,
        whatsappAccessToken: settings.whatsappAccessToken,
      },
    );
    return { intent: "test_notification", testResult };
  }

  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";

  const bool = (key: string) => form.get(key) === "true";

  const rawThreshold = parseInt(form.get("lowStockThreshold") as string);
  const rawEmail = ((form.get("notificationEmail") as string) ?? "").trim();
  const rawSlack = ((form.get("slackWebhookUrl") as string) ?? "").trim();
  const rawWhatsappPhone = ((form.get("whatsappPhone") as string) ?? "").trim();
  const rawWhatsappPhoneNumberId = ((form.get("whatsappPhoneNumberId") as string) ?? "").trim();
  const rawWhatsappAccessToken = ((form.get("whatsappAccessToken") as string) ?? "").trim();
  const emailEnabled = bool("emailNotifications");
  const whatsappEnabled = bool("whatsappNotifications");

  const errors: Record<string, string> = {};

  if (isNaN(rawThreshold) || rawThreshold < 1 || rawThreshold > 1000) {
    errors.lowStockThreshold = "Threshold must be between 1 and 1,000.";
  }

  if (emailEnabled && rawEmail) {
    const addresses = rawEmail.split(",").map((e) => e.trim()).filter(Boolean);
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const bad = addresses.find((e) => !emailRe.test(e));
    if (bad) {
      errors.notificationEmail = `"${bad}" is not a valid email address.`;
    } else if (plan !== "pro" && addresses.length > 1) {
      errors.notificationEmail = "Multiple recipients require the Professional plan.";
    }
  }

  if (rawSlack && !rawSlack.startsWith("https://hooks.slack.com/")) {
    errors.slackWebhookUrl = 'Slack webhook URL must start with "https://hooks.slack.com/".';
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
    emailNotifications: emailEnabled,
    slackNotifications: bool("slackNotifications"),
    notificationEmail: rawEmail || null,
    slackWebhookUrl: rawSlack || null,
    whatsappNotifications: whatsappEnabled,
    whatsappPhone: rawWhatsappPhone || null,
    whatsappPhoneNumberId: rawWhatsappPhoneNumberId || null,
    whatsappAccessToken: rawWhatsappAccessToken || null,
    digestEnabled: bool("digestEnabled"),
    digestFrequency: plan === "pro" && rawDigestFrequency === "daily" ? "daily" : "weekly",
    supplierLeadTimeDays: !isNaN(rawLeadTime) && rawLeadTime >= 1 && rawLeadTime <= 90 ? rawLeadTime : 7,
    monitoringFilter: (["all", "collection", "tags"] as const).includes(form.get("monitoringFilter") as any) ? form.get("monitoringFilter") as string : "all",
    monitoringCollectionId: ((form.get("monitoringCollectionId") as string) ?? "").trim() || null,
    monitoringTags: ((form.get("monitoringTags") as string) ?? "").trim() || null,
    ...(plan === "pro" ? {
      brandLogoUrl: ((form.get("brandLogoUrl") as string) ?? "").trim() || null,
      brandColor: /^#[0-9a-fA-F]{6}$/.test(rawBrandColor) ? rawBrandColor : null,
      brandSenderName: ((form.get("brandSenderName") as string) ?? "").trim() || null,
      outboundWebhookUrl: ((form.get("outboundWebhookUrl") as string) ?? "").trim() || null,
    } : {}),
  };

  await prisma.storeSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
  invalidateShopCache(shop);

  // Mark notifications configured when any delivery channel has a destination.
  // Previously only email and Slack were checked; WhatsApp was missed.
  const hasNotifications = !!(data.notificationEmail || data.slackWebhookUrl || data.whatsappPhone);
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

type TestResult = {
  error?: string;
  email?: { sent: boolean; to?: string; error?: string };
  slack?: { sent: boolean; error?: string };
  whatsapp?: { sent: boolean; error?: string };
};

const THRESHOLD_OPTIONS = [1, 3, 5, 10, 15, 20, 25, 50];

const inputStyle = (hasError = false): React.CSSProperties => ({
  width: "100%",
  border: `1.5px solid ${hasError ? "#fca5a5" : "#d1d5db"}`,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
  color: "#111827",
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
  transition: "border-color 0.15s",
});

const fieldLabel: React.CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: 13,
  color: "#374151",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const helpText: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 5,
  lineHeight: 1.5,
};

export default function SettingsPage() {
  const { settingsData } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings" sub-heading="Configure your inventory monitoring preferences">
      <Suspense fallback={<SettingsSkeleton />}>
        <Await resolve={settingsData}>{(data) => <SettingsContent data={data} />}</Await>
      </Suspense>

      {/* ── Danger Zone — static, doesn't depend on loaded settings ── */}
      <div style={{ marginTop: 24 }}>
        <s-section heading="Danger Zone">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", marginBottom: 2 }}>Reset all product data</div>
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
                Clears synced inventory and alert history. Your notification settings are kept. This cannot be undone.
              </p>
            </div>
            <Form
              method="post"
              onSubmit={(e) => { if (!confirm("Reset all product data? This cannot be undone.")) e.preventDefault(); }}
            >
              <input type="hidden" name="intent" value="reset" />
              <button
                type="submit"
                style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
              >
                Reset Product Data
              </button>
            </Form>
          </div>
        </s-section>
      </div>
    </s-page>
  );
}

function SettingsContent({ data }: { data: SettingsData }) {
  const { plan, storeEmail, settings } = data;
  const saveFetcher = useFetcher<typeof action>();
  const saving = saveFetcher.state !== "idle";
  const [autoHideEnabled, setAutoHideEnabled] = useState(settings.autoHideEnabled);
  const [autoRepublishEnabled, setAutoRepublishEnabled] = useState(settings.autoRepublishEnabled);
  const [emailEnabled, setEmailEnabled] = useState(settings.emailNotifications);
  const [slackEnabled, setSlackEnabled] = useState(settings.slackNotifications);
  const [whatsappEnabled, setWhatsappEnabled] = useState(settings.whatsappNotifications);
  const [whatsappPhone, setWhatsappPhone] = useState(settings.whatsappPhone);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(settings.whatsappPhoneNumberId);
  const [whatsappAccessToken, setWhatsappAccessToken] = useState(settings.whatsappAccessToken);
  const [digestEnabled, setDigestEnabled] = useState(settings.digestEnabled);
  const [digestFrequency, setDigestFrequency] = useState(settings.digestFrequency);
  const [brandLogoUrl, setBrandLogoUrl] = useState(settings.brandLogoUrl);
  const [brandColor, setBrandColor] = useState(settings.brandColor);
  const [brandSenderName, setBrandSenderName] = useState(settings.brandSenderName);
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState(settings.outboundWebhookUrl);
  const [monitoringFilter, setMonitoringFilter] = useState(settings.monitoringFilter);
  const [monitoringCollectionId, setMonitoringCollectionId] = useState(settings.monitoringCollectionId);
  const [monitoringTags, setMonitoringTags] = useState(settings.monitoringTags);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleDiscard() {
    setAutoHideEnabled(settings.autoHideEnabled);
    setAutoRepublishEnabled(settings.autoRepublishEnabled);
    setEmailEnabled(settings.emailNotifications);
    setSlackEnabled(settings.slackNotifications);
    setWhatsappEnabled(settings.whatsappNotifications);
    setWhatsappPhone(settings.whatsappPhone);
    setWhatsappPhoneNumberId(settings.whatsappPhoneNumberId);
    setWhatsappAccessToken(settings.whatsappAccessToken);
    setDigestEnabled(settings.digestEnabled);
    setDigestFrequency(settings.digestFrequency);
    setBrandLogoUrl(settings.brandLogoUrl);
    setBrandColor(settings.brandColor);
    setBrandSenderName(settings.brandSenderName);
    setOutboundWebhookUrl(settings.outboundWebhookUrl);
    setMonitoringFilter(settings.monitoringFilter);
    setMonitoringCollectionId(settings.monitoringCollectionId);
    setMonitoringTags(settings.monitoringTags);
    formRef.current?.reset();
    setIsDirty(false);
  }

  const testFetcher = useFetcher<typeof action>();
  const testing = testFetcher.state === "submitting";
  const testData =
    testFetcher.data && "intent" in testFetcher.data && testFetcher.data.intent === "test_notification"
      ? (testFetcher.data as { intent: string; testResult: TestResult }).testResult
      : null;

  const [toastResult, setToastResult] = useState<TestResult | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (testData) {
      setToastResult(testData);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastResult(null), 5000);
    }
  }, [testData]);

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
    fd.set("emailNotifications", emailEnabled ? "true" : "false");
    fd.set("slackNotifications", slackEnabled ? "true" : "false");
    fd.set("whatsappNotifications", whatsappEnabled ? "true" : "false");
    fd.set("whatsappPhone", whatsappPhone);
    fd.set("whatsappPhoneNumberId", whatsappPhoneNumberId);
    fd.set("whatsappAccessToken", whatsappAccessToken);
    fd.set("digestEnabled", digestEnabled ? "true" : "false");
    fd.set("digestFrequency", digestFrequency);
    fd.set("monitoringFilter", monitoringFilter);
    fd.set("monitoringCollectionId", monitoringCollectionId);
    fd.set("monitoringTags", monitoringTags);
    fd.set("brandLogoUrl", brandLogoUrl);
    fd.set("brandColor", brandColor || "#4f46e5");
    fd.set("brandSenderName", brandSenderName);
    fd.set("outboundWebhookUrl", outboundWebhookUrl);
    saveFetcher.submit(fd, { method: "post" });
  }

  const isPro = plan === "pro";
  const noChannelsConfigured = !emailEnabled && !(slackEnabled && isPro);

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

      <PlanCard plan={plan} />

      <Form method="post" ref={formRef} onChange={markDirty}>

        {/* ── Inventory Settings ── */}
        <s-section heading="Inventory Settings">
          {!isPro && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>Some features require the Professional plan.</span>
              <s-link href="/app/billing">Upgrade to Pro →</s-link>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <Toggle
              label="Auto-hide sold-out products"
              description="Products with zero inventory are automatically unpublished from your store."
              checked={autoHideEnabled}
              onChange={(v) => { setAutoHideEnabled(v); markDirty(); }}
            />
            <Toggle
              label="Auto-republish when restocked"
              description={!isPro ? "Requires Professional plan." : "Products are automatically republished when inventory is restored."}
              checked={autoRepublishEnabled && isPro}
              disabled={!isPro}
              onChange={(v) => { setAutoRepublishEnabled(v); markDirty(); }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            <div>
              <label style={fieldLabel}>Low stock threshold</label>
              <select
                name="lowStockThreshold"
                defaultValue={settings.lowStockThreshold}
                style={{ ...inputStyle(!!saveErrors?.lowStockThreshold), width: "auto", minWidth: 120 }}
              >
                {THRESHOLD_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v} {v === 1 ? "item" : "items"}</option>
                ))}
              </select>
              {saveErrors?.lowStockThreshold
                ? <p style={{ ...helpText, color: "#dc2626" }}>{saveErrors.lowStockThreshold}</p>
                : <p style={helpText}>Alert when inventory falls below this amount.</p>}
            </div>

            <div>
              <label style={fieldLabel}>Supplier lead time</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  name="supplierLeadTimeDays"
                  defaultValue={settings.supplierLeadTimeDays}
                  min={1}
                  max={90}
                  style={{ ...inputStyle(), width: 80 }}
                />
                <span style={{ fontSize: 14, color: "#374151" }}>days</span>
              </div>
              <p style={helpText}>Used to calculate "Reorder By" dates on the Products page.</p>
            </div>
          </div>
        </s-section>

        {/* ── Notifications ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Notifications">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              Choose how you receive stock alerts. At least one channel must be enabled to receive notifications.
            </p>

            {/* Email channel card */}
            <ChannelCard
              icon="✉️"
              title="Email"
              badge={null}
              enabled={emailEnabled}
              onToggle={(v) => { setEmailEnabled(v); markDirty(); }}
            >
              <div>
                <label style={fieldLabel}>
                  Notification email{isPro ? " — multiple allowed" : ""}
                </label>
                <input
                  type="text"
                  name="notificationEmail"
                  defaultValue={settings.notificationEmail}
                  placeholder={isPro ? "alerts@example.com, team@example.com" : "alerts@example.com"}
                  style={inputStyle(!!saveErrors?.notificationEmail)}
                />
                {saveErrors?.notificationEmail
                  ? <p style={{ ...helpText, color: "#dc2626" }}>{saveErrors.notificationEmail}</p>
                  : <p style={helpText}>
                      {isPro
                        ? "Separate multiple addresses with commas."
                        : storeEmail
                        ? `Leave empty to use store email (${storeEmail}).`
                        : "Leave empty to use the store owner email."}
                    </p>}
              </div>
            </ChannelCard>

            {/* Slack channel card */}
            <ChannelCard
              icon="💬"
              title="Slack"
              badge={!isPro ? "Pro" : null}
              enabled={slackEnabled && isPro}
              onToggle={isPro ? (v) => { setSlackEnabled(v); markDirty(); } : undefined}
              disabled={!isPro}
            >
              <div>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: "0 0 8px" }}>How to get a Slack webhook URL</p>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: 1.8 }}>
                    <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>api.slack.com/apps</a> → <strong>Create New App → From scratch</strong></li>
                    <li>Under <strong>Incoming Webhooks</strong>, toggle it <strong>On</strong></li>
                    <li>Click <strong>Add New Webhook to Workspace</strong> and choose a channel</li>
                    <li>Copy the generated URL and paste it below</li>
                  </ol>
                </div>
                <label style={fieldLabel}>Slack webhook URL</label>
                <input
                  type="text"
                  name="slackWebhookUrl"
                  defaultValue={settings.slackWebhookUrl}
                  placeholder="https://hooks.slack.com/services/..."
                  disabled={!isPro}
                  style={inputStyle(!!saveErrors?.slackWebhookUrl)}
                />
                {saveErrors?.slackWebhookUrl
                  ? <p style={{ ...helpText, color: "#dc2626" }}>{saveErrors.slackWebhookUrl}</p>
                  : <p style={helpText}>Paste the webhook URL from your Slack app settings.</p>}
              </div>
            </ChannelCard>

            {/* WhatsApp channel card */}
            <ChannelCard
              icon="💬"
              title="WhatsApp"
              badge="Coming Soon"
              badgeColor="#6b7280"
              enabled={false}
              disabled={true}
              onToggle={undefined}
            >
              <div>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "#166534", margin: "0 0 8px" }}>How to set up WhatsApp Business API</p>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: 1.8 }}>
                    <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>developers.facebook.com</a> → create an app</li>
                    <li>Add the <strong>WhatsApp</strong> product to your app</li>
                    <li>Copy your <strong>Phone Number ID</strong> and generate a <strong>permanent access token</strong></li>
                    <li>Enter the number you want alerts sent to below (include country code, e.g. 14155552671)</li>
                  </ol>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={fieldLabel}>Phone Number ID</label>
                    <input
                      type="text"
                      value={whatsappPhoneNumberId}
                      onChange={(e) => { setWhatsappPhoneNumberId(e.target.value); markDirty(); }}
                      placeholder="123456789012345"
                      style={inputStyle()}
                    />
                    <p style={helpText}>From Meta Developer Console → WhatsApp → API Setup.</p>
                  </div>
                  <div>
                    <label style={fieldLabel}>Recipient phone</label>
                    <input
                      type="text"
                      value={whatsappPhone}
                      onChange={(e) => { setWhatsappPhone(e.target.value); markDirty(); }}
                      placeholder="14155552671"
                      style={inputStyle()}
                    />
                    <p style={helpText}>Your WhatsApp number with country code, no +.</p>
                  </div>
                </div>

                <div>
                  <label style={fieldLabel}>Access token</label>
                  <input
                    type="password"
                    value={whatsappAccessToken}
                    onChange={(e) => { setWhatsappAccessToken(e.target.value); markDirty(); }}
                    placeholder="EAAxxxxx…"
                    style={inputStyle()}
                  />
                  <p style={helpText}>Permanent token from Meta System User or Developer Console.</p>
                </div>
              </div>
            </ChannelCard>

            {/* Test notification — plain button to avoid nested-form issue */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={testing || noChannelsConfigured || isDirty}
                onClick={() => testFetcher.submit({ intent: "test_notification" }, { method: "post" })}
                title={
                  isDirty ? "Save your settings before testing"
                  : noChannelsConfigured ? "Enable at least one notification channel"
                  : undefined
                }
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1.5px solid #d1d5db",
                  background: "#fff",
                  color: noChannelsConfigured || isDirty ? "#9ca3af" : "#374151",
                  cursor: testing || noChannelsConfigured || isDirty ? "not-allowed" : "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {testing ? "Sending…" : "Send Test Notification"}
              </button>
              {isDirty && <span style={{ fontSize: 12, color: "#9ca3af" }}>Save first to test.</span>}
            </div>
          </s-section>
        </div>

        {/* ── Digest Emails ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Digest Emails">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              A periodic summary of at-risk and out-of-stock products sent to your notification email.{" "}
              {isPro ? "Pro plan: choose daily or weekly." : "Basic plan: weekly every Monday."}
            </p>

            <Toggle
              label="Enable digest emails"
              description="Only sent when at-risk products exist — no empty reports."
              checked={digestEnabled}
              onChange={(v) => { setDigestEnabled(v); markDirty(); }}
            />

            {digestEnabled && (
              <div style={{ marginTop: 16, marginLeft: 0 }}>
                <label style={fieldLabel}>Frequency</label>
                {isPro ? (
                  <div style={{ display: "flex", gap: 10 }}>
                    {(["daily", "weekly"] as const).map((freq) => (
                      <label
                        key={freq}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                          padding: "10px 18px", borderRadius: 8,
                          border: `1.5px solid ${digestFrequency === freq ? "#4f46e5" : "#e5e7eb"}`,
                          background: digestFrequency === freq ? "#eef2ff" : "#fff",
                          fontSize: 14, fontWeight: 500, color: digestFrequency === freq ? "#4338ca" : "#374151",
                        }}
                      >
                        <input
                          type="radio"
                          name="digestFrequency"
                          value={freq}
                          checked={digestFrequency === freq}
                          onChange={() => { setDigestFrequency(freq); markDirty(); }}
                          style={{ display: "none" }}
                        />
                        {freq === "daily" ? "Daily" : "Weekly"}
                        {freq === "weekly" && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 4 }}>every Monday</span>}
                      </label>
                    ))}
                  </div>
                ) : (
                  <>
                    <input type="hidden" name="digestFrequency" value="weekly" />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#f9fafb", width: "fit-content" }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>Weekly</span>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>every Monday · Upgrade to Pro for daily</span>
                    </div>
                  </>
                )}
                <p style={helpText}>Digest is sent at 8:00 AM UTC.</p>
              </div>
            )}
          </s-section>
        </div>

        {/* ── Email Branding ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Email Branding">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              Customize how outgoing alert emails look. Applied to all notifications.{" "}
              {!isPro && <><span style={{ color: "#9ca3af" }}>Requires Professional plan.</span> <s-link href="/app/billing">Upgrade →</s-link></>}
            </p>

            <div style={{ opacity: isPro ? 1 : 0.45, pointerEvents: isPro ? "auto" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <label style={fieldLabel}>Sender name</label>
                  <input
                    type="text"
                    name="brandSenderName"
                    value={brandSenderName}
                    onChange={(e) => { setBrandSenderName(e.target.value); markDirty(); }}
                    placeholder="Stock Alert"
                    disabled={!isPro}
                    style={inputStyle()}
                  />
                  <p style={helpText}>Shown as "From" name in email clients.</p>
                </div>
                <div>
                  <label style={fieldLabel}>Brand color</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="color"
                      value={brandColor || "#4f46e5"}
                      onChange={(e) => { setBrandColor(e.target.value); markDirty(); }}
                      disabled={!isPro}
                      style={{ width: 40, height: 38, border: "1.5px solid #d1d5db", borderRadius: 8, cursor: isPro ? "pointer" : "not-allowed", padding: 2, flexShrink: 0 }}
                    />
                    <input
                      type="text"
                      name="brandColor"
                      value={brandColor || "#4f46e5"}
                      onChange={(e) => { setBrandColor(e.target.value); markDirty(); }}
                      placeholder="#4f46e5"
                      disabled={!isPro}
                      style={{ ...inputStyle(), width: 110, fontFamily: "monospace" }}
                    />
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: brandColor || "#4f46e5", border: "1px solid #e5e7eb", flexShrink: 0 }} />
                  </div>
                  <p style={helpText}>Used for email header and CTA button color.</p>
                </div>
              </div>

              <LogoUrlField
                value={brandLogoUrl}
                brandColor={brandColor}
                disabled={!isPro}
                onChange={(v) => { setBrandLogoUrl(v); markDirty(); }}
              />
            </div>
          </s-section>
        </div>

        {/* ── Outbound Webhook ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Outbound Webhook">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              Fire a JSON POST to any URL on every stock event. Connect Zapier, Make, or your own ERP.{" "}
              {!isPro && <><span style={{ color: "#9ca3af" }}>Requires Professional plan.</span> <s-link href="/app/billing">Upgrade →</s-link></>}
            </p>

            <div style={{ opacity: isPro ? 1 : 0.45, pointerEvents: isPro ? "auto" : "none" }}>
              <label style={fieldLabel}>Webhook URL</label>
              <input
                type="url"
                name="outboundWebhookUrl"
                value={outboundWebhookUrl}
                onChange={(e) => { setOutboundWebhookUrl(e.target.value); markDirty(); }}
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                disabled={!isPro}
                style={inputStyle()}
              />
              <p style={helpText}>Stock Alert will POST a JSON payload to this URL whenever an alert is triggered.</p>

              {isPro && outboundWebhookUrl && (
                <div style={{ marginTop: 12, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>Example payload</p>
                  <pre style={{ fontSize: 11, color: "#4b5563", margin: 0, overflow: "auto" }}>{JSON.stringify({
                    event: "low_stock",
                    shop: "your-store.myshopify.com",
                    productId: "1234567890",
                    productTitle: "Blue T-Shirt",
                    sku: "BTS-001",
                    currentQuantity: 3,
                    threshold: 5,
                    timestamp: new Date().toISOString(),
                  }, null, 2)}</pre>
                </div>
              )}
            </div>
          </s-section>
        </div>

        {/* ── Monitoring Scope ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Monitoring Scope">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              Choose which products Stock Alert tracks. Changes take effect on the next sync.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {[
                { value: "all",        label: "All products",        desc: "Monitor every product in your store." },
                { value: "collection", label: "Specific collection", desc: "Only products in a chosen collection." },
                { value: "tags",       label: "Product tags",        desc: "Only products with specific tags." },
              ].map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                    padding: "12px 14px", borderRadius: 8,
                    border: `1.5px solid ${monitoringFilter === opt.value ? "#4f46e5" : "#e5e7eb"}`,
                    background: monitoringFilter === opt.value ? "#eef2ff" : "#fff",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: `2px solid ${monitoringFilter === opt.value ? "#4f46e5" : "#d1d5db"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    {monitoringFilter === opt.value && (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4f46e5" }} />
                    )}
                  </div>
                  <input
                    type="radio"
                    name="_monitoringFilterRadio"
                    value={opt.value}
                    checked={monitoringFilter === opt.value}
                    onChange={() => { setMonitoringFilter(opt.value); markDirty(); }}
                    style={{ display: "none" }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: monitoringFilter === opt.value ? "#4338ca" : "#111827" }}>{opt.label}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            {monitoringFilter === "collection" && (
              <div>
                <label style={fieldLabel}>Collection ID</label>
                <input
                  type="text"
                  name="monitoringCollectionId"
                  value={monitoringCollectionId}
                  onChange={(e) => { setMonitoringCollectionId(e.target.value); markDirty(); }}
                  placeholder="e.g. 123456789"
                  style={inputStyle()}
                />
                <p style={helpText}>Find the ID in your Shopify admin URL: <code>/collections/[ID]</code></p>
              </div>
            )}

            {monitoringFilter === "tags" && (
              <div>
                <label style={fieldLabel}>Tags (comma-separated)</label>
                <input
                  type="text"
                  name="monitoringTags"
                  value={monitoringTags}
                  onChange={(e) => { setMonitoringTags(e.target.value); markDirty(); }}
                  placeholder="e.g. featured, sale, new-arrivals"
                  style={inputStyle()}
                />
                <p style={helpText}>Products with <em>any</em> of these tags will be monitored.</p>
              </div>
            )}

            {monitoringFilter !== "all" && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
                Save settings and run <strong>Sync Products</strong> on the Products page to apply the new scope.
              </div>
            )}
          </s-section>
        </div>
      </Form>

      {/* ── Test notification toast ── */}
      {toastResult && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 2000,
          display: "flex", flexDirection: "column", gap: 8,
          maxWidth: 360, width: "calc(100% - 48px)",
        }}>
          <TestResultBanner result={toastResult} onDismiss={() => setToastResult(null)} />
        </div>
      )}

      {/* ── Sticky unsaved changes bar ── */}
      {isDirty && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0,
          background: "#fff", borderBottom: "1px solid #e5e7eb",
          padding: "12px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          zIndex: 1000, boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>You have unsaved changes</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={handleDiscard}
              style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <div style={{ marginBottom: 24, padding: "16px 20px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <SkeletonBlock width={90} height={16} />
          <SkeletonBlock width={80} height={20} borderRadius={20} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 12px" }}>
          {Array.from({ length: 8 }, (_, i) => <SkeletonBlock key={i} width="80%" height={13} />)}
        </div>
      </div>

      <s-section heading="Inventory Settings">
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
              <SkeletonBlock width={220} height={14} />
              <SkeletonBlock width={44} height={24} borderRadius={12} />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
          <SkeletonBlock width={120} height={36} borderRadius={8} />
          <SkeletonBlock width={120} height={36} borderRadius={8} />
        </div>
      </s-section>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Notifications">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, marginBottom: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <SkeletonBlock width={120} height={16} />
                <SkeletonBlock width={44} height={24} borderRadius={12} />
              </div>
            </div>
          ))}
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Digest Emails">
          <SkeletonBlock width="100%" height={40} borderRadius={8} />
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Email Branding">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <SkeletonBlock width="100%" height={36} borderRadius={8} />
            <SkeletonBlock width="100%" height={36} borderRadius={8} />
          </div>
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Outbound Webhook">
          <SkeletonBlock width="100%" height={36} borderRadius={8} />
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Monitoring Scope">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} width="100%" height={56} borderRadius={8} />)}
          </div>
        </s-section>
      </div>
    </>
  );
}

/* ── Toggle switch — purely visual, form value is a hidden input in the parent Form ── */
function Toggle({
  label, description, checked, disabled, onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (val: boolean) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      padding: "12px 0", borderBottom: "1px solid #f3f4f6",
      opacity: disabled ? 0.5 : 1,
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{description}</div>}
      </div>
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange?.(!checked)}
        style={{ cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0 }}
      >
        <div style={{
          width: 44, height: 24, borderRadius: 12,
          background: checked && !disabled ? "#4f46e5" : "#d1d5db",
          position: "relative", transition: "background 0.2s",
        }}>
          <div style={{
            position: "absolute", top: 2,
            left: checked && !disabled ? 22 : 2,
            width: 20, height: 20, borderRadius: 10,
            background: "#fff", transition: "left 0.2s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }} />
        </div>
      </div>
    </div>
  );
}

/* ── Notification channel card ── */
function ChannelCard({
  icon, title, badge, badgeColor, enabled, onToggle, disabled, children,
}: {
  icon: string;
  title: string;
  badge: string | null;
  badgeColor?: string;
  enabled: boolean;
  onToggle?: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      border: `1.5px solid ${enabled && !disabled ? "#4f46e5" : "#e5e7eb"}`,
      borderRadius: 10, marginBottom: 12, overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px",
        background: enabled && !disabled ? "#fafafe" : "#f9fafb",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{title}</span>
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 700, background: badgeColor ?? "#4f46e5", color: "#fff", padding: "2px 8px", borderRadius: 20 }}>
              {badge}
            </span>
          )}
        </div>
        <div
          role="switch"
          aria-checked={enabled}
          onClick={() => !disabled && onToggle?.(!enabled)}
          style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
        >
          <div style={{
            width: 44, height: 24, borderRadius: 12,
            background: enabled && !disabled ? "#4f46e5" : "#d1d5db",
            position: "relative", transition: "background 0.2s",
          }}>
            <div style={{
              position: "absolute", top: 2,
              left: enabled ? 22 : 2,
              width: 20, height: 20, borderRadius: 10,
              background: "#fff", transition: "left 0.2s",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }} />
          </div>
        </div>
      </div>

      {/* Card body — only shown when enabled */}
      {enabled && !disabled && (
        <div style={{ padding: "16px 16px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Shopify file picker modal ── */
type ShopifyFile = { id: string; url: string; width: number | null; height: number | null; altText: string; mimeType: string };

function ShopifyFilePicker({
  onSelect, onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ files: ShopifyFile[]; hasNextPage: boolean; endCursor: string | null }>();
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allFiles, setAllFiles] = useState<ShopifyFile[]>([]);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function load(q: string, cur: string | null, append = false) {
    const params = new URLSearchParams({ search: q });
    if (cur) params.set("cursor", cur);
    fetcher.load(`/app/api/shopify-files?${params}`);
    if (!append) setAllFiles([]);
    setCursor(cur);
  }

  // Initial load
  useEffect(() => { load("", null); }, []);

  // Merge pages
  useEffect(() => {
    if (fetcher.data?.files) {
      setAllFiles((prev) => cursor ? [...prev, ...fetcher.data!.files] : fetcher.data!.files);
    }
  }, [fetcher.data]);

  function handleSearch(q: string) {
    setSearch(q);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => load(q, null), 400);
  }

  const loading = fetcher.state === "loading";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)",
      zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, width: "100%", maxWidth: 680, maxHeight: "85vh",
        display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Choose a logo from Shopify Files</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>PNG, JPG, SVG and WebP only</div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 18, cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by filename…"
            style={{ ...inputStyle(), maxWidth: 320 }}
            autoFocus
          />
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading && allFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Loading files…</div>
          ) : allFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
              {search ? `No images matching "${search}"` : "No image files found in your Shopify Files."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
              {allFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => { onSelect(file.url); onClose(); }}
                  style={{
                    border: "1.5px solid #e5e7eb", borderRadius: 8, background: "#f9fafb",
                    padding: 8, cursor: "pointer", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 6, transition: "border-color 0.15s, background 0.15s",
                    textAlign: "center",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = "#4f46e5"; e.currentTarget.style.background = "#eef2ff"; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9fafb"; }}
                >
                  <img
                    src={file.url}
                    alt={file.altText || ""}
                    style={{ width: "100%", height: 80, objectFit: "contain", borderRadius: 4 }}
                    loading="lazy"
                  />
                  {file.width && file.height && (
                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{file.width}×{file.height}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {fetcher.data?.hasNextPage && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => load(search, fetcher.data!.endCursor, true)}
                disabled={loading}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151" }}
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Logo URL field with Shopify file picker + live email preview ── */
function LogoUrlField({
  value, brandColor, disabled, onChange,
}: {
  value: string;
  brandColor: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [imgStatus, setImgStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [debouncedUrl, setDebouncedUrl] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!value) { setImgStatus("idle"); setDebouncedUrl(""); return; }
    setImgStatus("loading");
    const t = setTimeout(() => setDebouncedUrl(value), 500);
    return () => clearTimeout(t);
  }, [value]);

  const isValidUrl = (u: string) => { try { return Boolean(new URL(u)); } catch { return false; } };
  const showPreview = value && isValidUrl(value);
  const color = brandColor || "#4f46e5";

  return (
    <div>
      <label style={fieldLabel}>Logo URL</label>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="url"
            name="brandLogoUrl"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://yourstore.com/logo.png"
            disabled={disabled}
            style={{ ...inputStyle(), paddingRight: value ? 36 : 12 }}
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear logo URL"
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "#f3f4f6", border: "none", borderRadius: "50%",
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#6b7280", fontSize: 14, lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              padding: "9px 14px", borderRadius: 8, border: "1.5px solid #d1d5db",
              background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Browse Files
          </button>
        )}
      </div>

      <p style={helpText}>PNG, JPG, SVG or WebP only — max 400px wide. Shown at the top of every alert email.</p>

      {showPreview ? (
        <div style={{ marginTop: 16, maxWidth: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email preview</span>
            {imgStatus === "ok" && <span style={{ fontSize: 11, fontWeight: 600, color: "#059669" }}>✓ Logo loaded</span>}
            {imgStatus === "error" && <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>✗ Can't load image</span>}
          </div>

          <div style={{ background: color, padding: "20px 28px", borderRadius: 10, display: "flex", alignItems: "center" }}>
            {imgStatus === "error" ? (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>Logo failed to load</span>
            ) : debouncedUrl ? (
              <img
                key={debouncedUrl}
                src={debouncedUrl}
                alt="Logo"
                style={{ display: "block", width: "auto", maxHeight: 80, objectFit: "contain" }}
                onLoad={() => setImgStatus("ok")}
                onError={() => setImgStatus("error")}
              />
            ) : (
              <div style={{ height: 40, width: 130, background: "rgba(255,255,255,0.18)", borderRadius: 6 }} />
            )}
          </div>

          {imgStatus === "error" && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: "#fee2e2", fontSize: 12, color: "#991b1b", borderRadius: 8, border: "1px solid #fecaca" }}>
              Could not load image — make sure the URL is publicly accessible and links directly to an image file.
            </div>
          )}
        </div>
      ) : (
        !disabled && !value && (
          <div
            style={{ marginTop: 12, border: "2px dashed #e5e7eb", borderRadius: 10, padding: "24px 20px", textAlign: "center", background: "#f9fafb", maxWidth: 480, cursor: "pointer" }}
            onClick={() => setPickerOpen(true)}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
            <p style={{ fontSize: 13, color: "#4f46e5", margin: 0, fontWeight: 600 }}>Browse Shopify Files</p>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0" }}>or paste a URL above</p>
          </div>
        )
      )}

      {pickerOpen && (
        <ShopifyFilePicker
          onSelect={(url) => { onChange(url); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Plan card ── */
function PlanCard({ plan }: { plan: string }) {
  const isPro = plan === "pro";
  const features = [
    { label: "Email alerts",                   pro: false },
    { label: "Inventory monitoring",            pro: false },
    { label: "Auto-hide out-of-stock",          pro: false },
    { label: `Up to ${isPro ? "10,000" : "1,000"} products`, pro: false },
    { label: "Slack notifications",             pro: true  },
    { label: "Multiple email recipients",       pro: true  },
    { label: "Auto-republish on restock",       pro: true  },
    { label: "Per-product thresholds",          pro: true  },
    { label: "Outbound webhook / Zapier",       pro: true  },
    { label: "Email branding",                  pro: true  },
  ];

  return (
    <div style={{ marginBottom: 24, padding: "16px 20px", background: isPro ? "#fafafe" : "#f9fafb", border: `1px solid ${isPro ? "#c7d2fe" : "#e5e7eb"}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Current Plan</span>
          <span style={{
            padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: isPro ? "#4f46e5" : "#6b7280", color: "#fff",
          }}>
            {isPro ? "Professional" : "Basic"}
          </span>
        </div>
        {!isPro && <s-link href="/app/billing">Upgrade to Pro →</s-link>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "6px 12px" }}>
        {features.map((f) => {
          const active = !f.pro || isPro;
          return (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: active ? "#374151" : "#9ca3af" }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{active ? "✓" : "🔒"}</span>
              {f.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Test result toast ── */
function TestResultBanner({ result, onDismiss }: { result: TestResult; onDismiss?: () => void }) {
  const rows: { ok: boolean; text: string }[] = [];

  if (result.error) {
    rows.push({ ok: false, text: result.error });
  } else {
    if (result.email) rows.push({ ok: result.email.sent, text: result.email.sent ? `Email sent to ${result.email.to}` : `Email failed: ${result.email.error}` });
    if (result.slack) rows.push({ ok: result.slack.sent, text: result.slack.sent ? "Slack message sent" : `Slack failed: ${result.slack.error}` });
    if (result.whatsapp) rows.push({ ok: result.whatsapp.sent, text: result.whatsapp.sent ? "WhatsApp message sent" : `WhatsApp failed: ${result.whatsapp.error}` });
    if (!result.email && !result.slack && !result.whatsapp) rows.push({ ok: false, text: "No notification channels enabled." });
  }

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Test Notification</span>
        {onDismiss && (
          <button type="button" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        )}
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: r.ok ? "#065f46" : "#991b1b" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{r.ok ? "✓" : "✗"}</span>
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
