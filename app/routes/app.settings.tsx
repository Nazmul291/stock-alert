import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendTestNotification } from "../lib/notifications";
import { invalidateShopCache } from "../lib/shop-cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [settings, storeSession] = await Promise.all([
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.session.findFirst({ where: { shop, isOnline: false } }),
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
        }
      : {
          autoHideEnabled: false,
          autoRepublishEnabled: false,
          lowStockThreshold: 5,
          emailNotifications: true,
          slackNotifications: false,
          notificationEmail: "",
          slackWebhookUrl: "",
        },
  };
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

  if (intent === "test_notification") {
    const [settings, storeSession] = await Promise.all([
      prisma.storeSettings.findUnique({ where: { shop } }),
      prisma.session.findFirst({ where: { shop, isOnline: false } }),
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
      },
    );
    return { intent: "test_notification", testResult };
  }

  // Save settings — validate first
  const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  const plan = storeSession?.plan ?? "basic";

  const rawThreshold = parseInt(form.get("lowStockThreshold") as string);
  const rawEmail = ((form.get("notificationEmail") as string) ?? "").trim();
  const rawSlack = ((form.get("slackWebhookUrl") as string) ?? "").trim();
  const emailEnabled = form.get("emailNotifications") === "true";

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
      errors.notificationEmail = "Multiple recipients require the Professional plan. Upgrade to Pro or use a single address.";
    }
  }

  if (rawSlack && !rawSlack.startsWith("https://hooks.slack.com/")) {
    errors.slackWebhookUrl = 'Slack webhook URL must start with "https://hooks.slack.com/".';
  }

  if (Object.keys(errors).length > 0) {
    return { intent: "save", success: false as const, errors };
  }

  const data = {
    autoHideEnabled: form.get("autoHideEnabled") === "true",
    autoRepublishEnabled: form.get("autoRepublishEnabled") === "true",
    lowStockThreshold: rawThreshold,
    emailNotifications: emailEnabled,
    slackNotifications: form.get("slackNotifications") === "true",
    notificationEmail: rawEmail || null,
    slackWebhookUrl: rawSlack || null,
  };

  await prisma.storeSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
  invalidateShopCache(shop);

  const hasNotifications = !!(data.notificationEmail || data.slackWebhookUrl);
  const isConfigured = data.lowStockThreshold !== 5 || !!data.notificationEmail;

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
};

const THRESHOLD_OPTIONS = [1, 3, 5, 10, 15, 20, 25, 50];

export default function SettingsPage() {
  const { plan, storeEmail, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const saving = nav.state === "submitting";
  const [emailEnabled, setEmailEnabled] = useState(settings.emailNotifications);
  const [slackEnabled, setSlackEnabled] = useState(settings.slackNotifications);
  const [isDirty, setIsDirty] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const testFetcher = useFetcher<typeof action>();
  const testing = testFetcher.state === "submitting";
  const testData = testFetcher.data && "intent" in testFetcher.data && testFetcher.data.intent === "test_notification"
    ? (testFetcher.data as { intent: string; testResult: TestResult }).testResult
    : null;

  const saveErrors = actionData && "intent" in actionData && actionData.intent === "save" && !(actionData as any).success
    ? (actionData as any).errors as Record<string, string>
    : null;

  useEffect(() => {
    if (actionData && "intent" in actionData && actionData.intent === "save" && (actionData as any).success) {
      setIsDirty(false);
    }
  }, [actionData]);

  const noChannelsConfigured = !emailEnabled && !(slackEnabled && plan === "pro");
  const effectiveEmail = settings.notificationEmail || storeEmail;

  return (
    <s-page heading="Settings" sub-heading="Configure your inventory monitoring preferences">
      <s-button
        slot="primary-action"
        disabled={!isDirty || saving}
        onClick={() => formRef.current?.requestSubmit()}
      >
        {saving ? "Saving…" : "Save Settings"}
      </s-button>

      {actionData && "intent" in actionData && actionData.intent === "save" && (actionData as any).success && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#065f46" }}>
          {(actionData as any).message}
        </div>
      )}

      {saveErrors && Object.keys(saveErrors).length > 0 && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 14 }}>
          Please fix the following errors before saving:
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {Object.values(saveErrors).map((msg, i) => <li key={i}>{msg}</li>)}
          </ul>
        </div>
      )}

      {/* Plan summary */}
      <PlanCard plan={plan} />

      <Form method="post" ref={formRef} onChange={() => setIsDirty(true)}>
        <s-section heading="Inventory Settings">
          {plan !== "pro" && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "10px 14px", marginBottom: 12, fontSize: 14 }}>
              Some features require the Professional plan.{" "}
              <a href="/app/billing" style={{ color: "#1d4ed8" }}>Upgrade to unlock all features →</a>
            </div>
          )}

          <ToggleField
            label="Auto-hide sold-out products"
            name="autoHideEnabled"
            checked={settings.autoHideEnabled}
            helpText="Products with zero inventory are automatically unpublished from your store."
          />

          <ToggleField
            label="Auto-republish when restocked"
            name="autoRepublishEnabled"
            checked={settings.autoRepublishEnabled && plan === "pro"}
            disabled={plan !== "pro"}
            helpText={plan !== "pro" ? "Requires Professional plan." : "Products are automatically republished when inventory is added."}
          />

          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              Low stock threshold
            </label>
            <select
              name="lowStockThreshold"
              defaultValue={settings.lowStockThreshold}
              aria-label="Low stock threshold"
              style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }}
            >
              {THRESHOLD_OPTIONS.map((v) => (
                <option key={v} value={v}>{v} {v === 1 ? "item" : "items"}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Alert when inventory falls below this amount.</p>
          </div>
        </s-section>

        <div style={{ marginTop: 24 }}>
          <s-section heading="Notifications">
            <ToggleField
              label="Email notifications"
              name="emailNotifications"
              checked={emailEnabled}
              onChange={setEmailEnabled}
            />

            {emailEnabled && (
              <div style={{ marginTop: 8 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                  Notification email{plan === "pro" ? " (multiple allowed)" : ""}
                </label>
                <input
                  type="text"
                  name="notificationEmail"
                  defaultValue={settings.notificationEmail}
                  placeholder={plan === "pro" ? "alerts@example.com, team@example.com" : "alerts@example.com"}
                  style={{
                    width: "100%", border: `1px solid ${saveErrors?.notificationEmail ? "#fca5a5" : "#d1d5db"}`,
                    borderRadius: 6, padding: "6px 10px", fontSize: 14,
                  }}
                />
                {saveErrors?.notificationEmail ? (
                  <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>{saveErrors.notificationEmail}</p>
                ) : (
                  <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                    {plan === "pro"
                      ? "Separate multiple addresses with commas."
                      : effectiveEmail
                      ? `Leave empty to use store owner email (${storeEmail}).`
                      : "Leave empty to use the store owner email."}
                  </p>
                )}
              </div>
            )}

            <ToggleField
              label="Slack notifications"
              name="slackNotifications"
              checked={slackEnabled && plan === "pro"}
              disabled={plan !== "pro"}
              helpText={plan !== "pro" ? "Requires Professional plan." : undefined}
              onChange={plan === "pro" ? setSlackEnabled : undefined}
            />

            {slackEnabled && plan === "pro" && (
              <div style={{ marginTop: 8 }}>
                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 10 }}>How to create a Slack webhook</p>
                  <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: "1.8" }}>
                    <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>api.slack.com/apps</a> and click <strong>Create New App</strong> → <strong>From scratch</strong>.</li>
                    <li>Name your app (e.g. <em>Stock Alert</em>), select your workspace, then click <strong>Create App</strong>.</li>
                    <li>Under <strong>Add features and functionality</strong>, click <strong>Incoming Webhooks</strong>.</li>
                    <li>Toggle <strong>Activate Incoming Webhooks</strong> to <strong>On</strong>.</li>
                    <li>Scroll down and click <strong>Add New Webhook to Workspace</strong>, then choose the channel to post alerts to.</li>
                    <li>Click <strong>Allow</strong> — Slack generates a webhook URL starting with <code style={{ background: "#e5e7eb", borderRadius: 3, padding: "1px 4px", fontSize: 12 }}>https://hooks.slack.com/services/…</code></li>
                    <li>Copy that URL and paste it below.</li>
                  </ol>
                </div>
                <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Slack webhook URL</label>
                <input
                  type="text"
                  name="slackWebhookUrl"
                  defaultValue={settings.slackWebhookUrl}
                  placeholder="https://hooks.slack.com/services/..."
                  style={{
                    width: "100%", border: `1px solid ${saveErrors?.slackWebhookUrl ? "#fca5a5" : "#d1d5db"}`,
                    borderRadius: 6, padding: "6px 10px", fontSize: 14,
                  }}
                />
                {saveErrors?.slackWebhookUrl ? (
                  <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>{saveErrors.slackWebhookUrl}</p>
                ) : (
                  <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Paste the webhook URL generated from your Slack app.</p>
                )}
              </div>
            )}

            {/* Test notification */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #f3f4f6" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <testFetcher.Form method="post">
                  <input type="hidden" name="intent" value="test_notification" />
                  <button
                    type="submit"
                    disabled={testing || noChannelsConfigured || isDirty}
                    title={isDirty ? "Save your settings before testing" : noChannelsConfigured ? "Enable at least one notification channel" : undefined}
                    style={{
                      padding: "7px 16px",
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                      background: testing ? "#f3f4f6" : "#fff",
                      color: noChannelsConfigured || isDirty ? "#9ca3af" : "#374151",
                      cursor: testing || noChannelsConfigured || isDirty ? "not-allowed" : "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {testing ? "Sending…" : "Send Test Notification"}
                  </button>
                </testFetcher.Form>
                {isDirty && (
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Save settings first to test.</span>
                )}
              </div>

              {testData && (
                <TestResultBanner result={testData} />
              )}
            </div>
          </s-section>
        </div>
      </Form>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Danger Zone">
          <s-paragraph>
            Reset all synced product data and alert history for this store. Your notification settings are kept. This cannot be undone.
          </s-paragraph>
          <Form method="post" onSubmit={(e) => { if (!confirm("Reset all product data? This cannot be undone.")) e.preventDefault(); }}>
            <input type="hidden" name="intent" value="reset" />
            <button
              type="submit"
              disabled={saving}
              style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
            >
              {saving ? "Resetting…" : "Reset All Product Data"}
            </button>
          </Form>
        </s-section>
      </div>
    </s-page>
  );
}

function PlanCard({ plan }: { plan: string }) {
  const isPro = plan === "pro";
  const features = [
    { label: "Email alerts",                     pro: false },
    { label: "Inventory monitoring",              pro: false },
    { label: "Auto-hide out-of-stock products",   pro: false },
    { label: `Up to ${isPro ? "10,000" : "1,000"} products tracked`, pro: false },
    { label: "Slack notifications",               pro: true  },
    { label: "Multiple email recipients",         pro: true  },
    { label: "Auto-republish on restock",         pro: true  },
    { label: "Per-product custom thresholds",     pro: true  },
  ];

  return (
    <div style={{ marginBottom: 24, padding: "16px 20px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Current Plan</span>
          <span style={{
            padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: isPro ? "#4f46e5" : "#6b7280", color: "#fff",
          }}>
            {isPro ? "Professional" : "Basic"}
          </span>
        </div>
        {!isPro && (
          <a href="/app/billing" style={{ fontSize: 13, color: "#4f46e5", fontWeight: 600, textDecoration: "none" }}>
            Upgrade to Pro →
          </a>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px 16px" }}>
        {features.map((f) => {
          const active = !f.pro || isPro;
          return (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: active ? "#374151" : "#9ca3af" }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{active ? "✅" : "🔒"}</span>
              {f.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TestResultBanner({ result }: { result: TestResult }) {
  if (result.error) {
    return (
      <div style={{ marginTop: 12, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "#991b1b" }}>
        {result.error}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
      {result.email && (
        <div style={{
          background: result.email.sent ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${result.email.sent ? "#a7f3d0" : "#fca5a5"}`,
          borderRadius: 6, padding: "8px 12px", fontSize: 13,
          color: result.email.sent ? "#065f46" : "#991b1b",
        }}>
          {result.email.sent
            ? `Email sent to ${result.email.to}`
            : `Email failed: ${result.email.error}`}
        </div>
      )}
      {result.slack && (
        <div style={{
          background: result.slack.sent ? "#d1fae5" : "#fee2e2",
          border: `1px solid ${result.slack.sent ? "#a7f3d0" : "#fca5a5"}`,
          borderRadius: 6, padding: "8px 12px", fontSize: 13,
          color: result.slack.sent ? "#065f46" : "#991b1b",
        }}>
          {result.slack.sent
            ? "Slack message sent successfully"
            : `Slack failed: ${result.slack.error}`}
        </div>
      )}
      {!result.email && !result.slack && (
        <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#92400e" }}>
          No notification channels are enabled. Turn on Email or Slack notifications above.
        </div>
      )}
    </div>
  );
}

function ToggleField({
  label, name, checked, disabled, helpText, onChange,
}: {
  label: string;
  name: string;
  checked: boolean;
  disabled?: boolean;
  helpText?: string;
  onChange?: (val: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
        <input type="hidden" name={name} value="false" />
        <input
          type="checkbox"
          name={name}
          value="true"
          disabled={disabled}
          {...(onChange
            ? { checked, onChange: (e) => onChange(e.target.checked) }
            : { defaultChecked: checked })}
          style={{ width: 16, height: 16 }}
        />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
      </label>
      {helpText && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2, marginLeft: 24 }}>{helpText}</p>}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
