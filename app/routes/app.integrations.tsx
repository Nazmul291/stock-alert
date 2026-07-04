import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useSearchParams, Form, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendTestNotification } from "../lib/notifications";
import { getCachedSettings, getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { revokeSlackToken, mintSlackOAuthState } from "../lib/slack-oauth.server";
import { SkeletonBlock, SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { IntegrationsData } from "../lib/integrations-data.server";
import { useSSEData } from "../hooks/use-sse-data";
import {
  ChannelCard, ConnectRow, ConnectModal, TestResultBanner, inputStyle, fieldLabel, helpText,
  type TestResult,
} from "../components/IntegrationControls";

// Only the auth check blocks the response — integrations data loads entirely in
// the background via api.integrations-stream.ts and is pushed to the client
// over SSE once ready. loadIntegrationsData itself lives in
// app/lib/integrations-data.server.ts, not here — see app._index.tsx's loader
// comment for why a plain exported function can't stay in a route file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const token = await mintSseToken(shop);
  // Longer-lived token for the "Connect to Slack" link, encoding `host`
  // alongside `shop` — see slack-oauth.server.ts for why both are needed at
  // the end of the OAuth round-trip.
  const host = new URL(request.url).searchParams.get("host") ?? "";
  const slackConnectToken = await mintSlackOAuthState({ shop, host });
  return { token, slackConnectToken };
};

// Recomputed after every mutation intent below (each one only touches its own
// channel's fields) rather than relying on the fields the current form
// submitted, since e.g. disconnect_slack doesn't know about the email/klaviyo
// state and vice versa.
async function syncNotificationsConfigured(shop: string) {
  const settings = await prisma.storeSettings.findUnique({ where: { shop } });
  const hasNotifications = !!(
    (settings?.emailNotifications && settings?.notificationEmail) ||
    settings?.slackWebhookUrl ||
    settings?.whatsappPhone ||
    (settings?.klaviyoEnabled && settings?.klaviyoApiKey)
  );
  await prisma.setupProgress.upsert({
    where: { shop },
    update: { notificationsConfigured: hasNotifications },
    create: {
      shop,
      appInstalled: true,
      globalSettingsConfigured: false,
      notificationsConfigured: hasNotifications,
      productThresholdsConfigured: false,
      firstProductTracked: false,
    },
  });
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "test_notification") {
    const [settings, storeSession] = await Promise.all([
      getCachedSettings(shop),
      getCachedSession(shop),
    ]);
    if (!settings) {
      return { intent: "test_notification", testResult: { error: "Save your integrations first before sending a test." } };
    }
    const testResult = await sendTestNotification(
      { shop, plan: storeSession?.plan ?? "basic", email: storeSession?.email ?? null },
      {
        emailNotifications: settings.emailNotifications,
        notificationEmail: settings.notificationEmail,
        slackNotifications: settings.slackNotifications,
        slackWebhookUrl: settings.slackWebhookUrl,
        whatsappNotifications: settings.whatsappNotifications,
        whatsappPhone: settings.whatsappPhone,
        whatsappPhoneNumberId: settings.whatsappPhoneNumberId,
        whatsappAccessToken: settings.whatsappAccessToken,
        klaviyoEnabled: settings.klaviyoEnabled,
        klaviyoApiKey: settings.klaviyoApiKey,
      },
    );
    return { intent: "test_notification", testResult };
  }

  if (intent === "disconnect_slack") {
    const settings = await getCachedSettings(shop);
    if (settings?.slackAccessToken) {
      await revokeSlackToken(settings.slackAccessToken);
    }
    await prisma.storeSettings.upsert({
      where: { shop },
      update: {
        slackNotifications: false,
        slackWebhookUrl: null,
        slackTeamName: null,
        slackChannelName: null,
        slackAccessToken: null,
      },
      create: { shop, slackNotifications: false },
    });
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "disconnect_slack", success: true };
  }

  if (intent === "save_email") {
    const storeSession = await getCachedSession(shop);
    const plan = storeSession?.plan ?? "basic";
    const rawEmail = ((form.get("notificationEmail") as string) ?? "").trim();

    if (rawEmail) {
      const addresses = rawEmail.split(",").map((e) => e.trim()).filter(Boolean);
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const bad = addresses.find((e) => !emailRe.test(e));
      if (bad) {
        return { intent: "save_email", success: false as const, error: `"${bad}" is not a valid email address.` };
      }
      if (plan !== "pro" && addresses.length > 1) {
        return { intent: "save_email", success: false as const, error: "Multiple recipients require the Professional plan." };
      }
    }

    await prisma.storeSettings.upsert({
      where: { shop },
      update: { emailNotifications: true, notificationEmail: rawEmail || null },
      create: { shop, emailNotifications: true, notificationEmail: rawEmail || null },
    });
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "save_email", success: true };
  }

  if (intent === "disable_email") {
    await prisma.storeSettings.upsert({
      where: { shop },
      update: { emailNotifications: false },
      create: { shop, emailNotifications: false },
    });
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "disable_email", success: true };
  }

  if (intent === "save_klaviyo") {
    const storeSession = await getCachedSession(shop);
    if (storeSession?.plan !== "pro") {
      return { intent: "save_klaviyo", success: false as const, error: "Klaviyo is a Professional plan feature." };
    }
    const rawKlaviyoApiKey = ((form.get("klaviyoApiKey") as string) ?? "").trim();
    if (!rawKlaviyoApiKey) {
      return { intent: "save_klaviyo", success: false as const, error: "Enter your Klaviyo private API key." };
    }
    await prisma.storeSettings.upsert({
      where: { shop },
      update: { klaviyoEnabled: true, klaviyoApiKey: rawKlaviyoApiKey },
      create: { shop, klaviyoEnabled: true, klaviyoApiKey: rawKlaviyoApiKey },
    });
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "save_klaviyo", success: true };
  }

  if (intent === "disconnect_klaviyo") {
    await prisma.storeSettings.upsert({
      where: { shop },
      update: { klaviyoEnabled: false, klaviyoApiKey: null },
      create: { shop, klaviyoEnabled: false },
    });
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "disconnect_klaviyo", success: true };
  }

  // General save — WhatsApp + Outbound Webhook only. Email, Slack, and
  // Klaviyo are each managed by their own scoped connect/disconnect intents
  // above via modals, not this form.
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";
  const isPro = plan === "pro";

  const bool = (key: string) => form.get(key) === "true";
  const rawWhatsappPhone = ((form.get("whatsappPhone") as string) ?? "").trim();
  const rawWhatsappPhoneNumberId = ((form.get("whatsappPhoneNumberId") as string) ?? "").trim();
  const rawWhatsappAccessToken = ((form.get("whatsappAccessToken") as string) ?? "").trim();

  const data = {
    whatsappNotifications: bool("whatsappNotifications"),
    whatsappPhone: rawWhatsappPhone || null,
    whatsappPhoneNumberId: rawWhatsappPhoneNumberId || null,
    whatsappAccessToken: rawWhatsappAccessToken || null,
    ...(isPro ? { outboundWebhookUrl: ((form.get("outboundWebhookUrl") as string) ?? "").trim() || null } : {}),
  };

  await prisma.storeSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });
  invalidateShopCache(shop);
  await syncNotificationsConfigured(shop);

  return { intent: "save", success: true, message: "Integrations saved successfully." };
};

const FLOW_TRIGGERS = [
  { name: "Low stock", desc: "Fires when a product's inventory drops to or below its threshold." },
  { name: "Out of stock", desc: "Fires when a product's inventory reaches zero." },
  { name: "Restock", desc: "Fires when a previously low/out-of-stock product is restocked." },
];

export default function IntegrationsPage() {
  const { token, slackConnectToken } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<IntegrationsData>(
    `/api/integrations-stream?token=${encodeURIComponent(token)}`,
  );
  const [searchParams] = useSearchParams();
  const slackError = searchParams.get("slack_error") === "1";

  return (
    <s-page heading="Integrations" sub-heading="Connect Stock Alert to Slack, WhatsApp, Shopify Flow, Klaviyo, and your own systems">
      {slackError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#991b1b", fontSize: 14 }}>
          Couldn&apos;t connect to Slack — please try again.
        </div>
      )}
      {error ? (
        <SSEErrorRetry message={error} onRetry={retry} />
      ) : data ? (
        <IntegrationsContent data={data} slackConnectToken={slackConnectToken} retry={retry} />
      ) : (
        <IntegrationsSkeleton />
      )}
    </s-page>
  );
}

function IntegrationsContent({ data, slackConnectToken, retry }: { data: IntegrationsData; slackConnectToken: string; retry: () => void }) {
  const { plan, storeEmail, settings } = data;
  const isPro = plan === "pro";

  const saveFetcher = useFetcher<typeof action>();
  const saving = saveFetcher.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);

  const [whatsappPhone, setWhatsappPhone] = useState(settings.whatsappPhone);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState(settings.whatsappPhoneNumberId);
  const [whatsappAccessToken, setWhatsappAccessToken] = useState(settings.whatsappAccessToken);
  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState(settings.outboundWebhookUrl);
  const [isDirty, setIsDirty] = useState(false);

  function markDirty() {
    setIsDirty(true);
  }

  function handleDiscard() {
    setWhatsappPhone(settings.whatsappPhone);
    setWhatsappPhoneNumberId(settings.whatsappPhoneNumberId);
    setWhatsappAccessToken(settings.whatsappAccessToken);
    setOutboundWebhookUrl(settings.outboundWebhookUrl);
    formRef.current?.reset();
    setIsDirty(false);
  }

  const testFetcher = useFetcher<typeof action>();
  const testing = testFetcher.state === "submitting";
  const testData =
    testFetcher.data && "intent" in testFetcher.data && testFetcher.data.intent === "test_notification"
      ? (testFetcher.data as { intent: string; testResult: TestResult }).testResult
      : null;

  const disconnectFetcher = useFetcher<typeof action>();
  const disconnecting = disconnectFetcher.state !== "idle";

  // Email — connect/disconnect via modal, same pattern as Slack/Klaviyo below.
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState(settings.notificationEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const emailFetcher = useFetcher<typeof action>();
  const emailSaving = emailFetcher.state !== "idle";
  const emailDisableFetcher = useFetcher<typeof action>();
  const emailDisabling = emailDisableFetcher.state !== "idle";

  // Klaviyo — connect/disconnect via modal. The API key is write-only (never
  // sent to the client), so the input always starts blank.
  const [klaviyoModalOpen, setKlaviyoModalOpen] = useState(false);
  const [klaviyoInput, setKlaviyoInput] = useState("");
  const [klaviyoError, setKlaviyoError] = useState<string | null>(null);
  const klaviyoFetcher = useFetcher<typeof action>();
  const klaviyoSaving = klaviyoFetcher.state !== "idle";
  const klaviyoDisconnectFetcher = useFetcher<typeof action>();
  const klaviyoDisconnecting = klaviyoDisconnectFetcher.state !== "idle";

  const [toastResult, setToastResult] = useState<TestResult | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (testData) {
      setToastResult(testData);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToastResult(null), 5000);
    }
  }, [testData]);

  // Refresh the SSE data after any connect/disconnect mutation so the row
  // reflects the new state without a full page reload.
  useEffect(() => {
    const d = disconnectFetcher.data as any;
    if (d?.intent === "disconnect_slack" && d?.success) retry();
  }, [disconnectFetcher.data]);

  useEffect(() => {
    const d = emailFetcher.data as any;
    if (d?.intent === "save_email") {
      if (d.success) {
        setEmailModalOpen(false);
        setEmailError(null);
        retry();
      } else {
        setEmailError(d.error ?? "Something went wrong.");
      }
    }
  }, [emailFetcher.data]);

  useEffect(() => {
    const d = emailDisableFetcher.data as any;
    if (d?.intent === "disable_email" && d?.success) retry();
  }, [emailDisableFetcher.data]);

  useEffect(() => {
    const d = klaviyoFetcher.data as any;
    if (d?.intent === "save_klaviyo") {
      if (d.success) {
        setKlaviyoModalOpen(false);
        setKlaviyoError(null);
        retry();
      } else {
        setKlaviyoError(d.error ?? "Something went wrong.");
      }
    }
  }, [klaviyoFetcher.data]);

  useEffect(() => {
    const d = klaviyoDisconnectFetcher.data as any;
    if (d?.intent === "disconnect_klaviyo" && d?.success) retry();
  }, [klaviyoDisconnectFetcher.data]);

  const saveData = saveFetcher.data as any;
  const saveSuccess = saveData && saveData.intent === "save" && saveData.success;

  useEffect(() => {
    const d = saveFetcher.data as any;
    if (d?.intent === "save" && d?.success) setIsDirty(false);
  }, [saveFetcher.data]);

  function handleSave() {
    const fd = new FormData(formRef.current ?? undefined);
    fd.set("whatsappNotifications", "false");
    fd.set("whatsappPhone", whatsappPhone);
    fd.set("whatsappPhoneNumberId", whatsappPhoneNumberId);
    fd.set("whatsappAccessToken", whatsappAccessToken);
    fd.set("outboundWebhookUrl", outboundWebhookUrl);
    saveFetcher.submit(fd, { method: "post" });
  }

  const noChannelsConfigured = !settings.emailNotifications && !(settings.slackConnected && isPro) && !(settings.klaviyoEnabled && isPro);

  return (
    <>
      {isDirty && <div style={{ height: 57 }} />}

      {saveSuccess && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#065f46", fontSize: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          {saveData?.message}
        </div>
      )}

      <Form method="post" ref={formRef} onChange={markDirty}>

        {/* ── Notifications: Email, Slack, WhatsApp ── */}
        <s-section heading="Notifications">
          <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
            Send stock alerts by email, Slack, or WhatsApp.
          </p>

          {/* Email — connect/disconnect via modal, no more inline toggle */}
          <ConnectRow
            icon={<span style={{ fontSize: 20 }}>✉️</span>}
            title="Email"
            connected={settings.emailNotifications}
            connectLabel="Connect"
            onConnect={() => { setEmailInput(settings.notificationEmail); setEmailError(null); setEmailModalOpen(true); }}
            onDisconnect={() => emailDisableFetcher.submit({ intent: "disable_email" }, { method: "post" })}
            disconnecting={emailDisabling}
            connectedLabel={
              <>Sending to <strong>{settings.notificationEmail || storeEmail || "the store owner email"}</strong>.</>
            }
          />

          {/* Slack — connected via OAuth, not a manual webhook-URL paste */}
          <ConnectRow
            icon={
              <img
                src="https://a.slack-edge.com/e6a93c1/img/icons/favicon-32.png"
                alt=""
                width={20}
                height={20}
                loading="lazy"
                style={{ display: "block" }}
              />
            }
            title="Slack"
            badge={!isPro ? "Pro" : null}
            connected={isPro && settings.slackConnected}
            locked={!isPro}
            lockedNode={<s-link href="/app/billing">Upgrade to Pro →</s-link>}
            connectLabel="Connect to Slack"
            hideEdit
            onConnect={() => {
              window.open(`/api/slack/connect?token=${encodeURIComponent(slackConnectToken)}`, "_blank", "noopener,noreferrer");
            }}
            onDisconnect={() => {
              if (confirm("Disconnect Slack? Alerts will stop sending until you reconnect.")) {
                disconnectFetcher.submit({ intent: "disconnect_slack" }, { method: "post" });
              }
            }}
            disconnecting={disconnecting}
            connectedLabel={
              <>Connected to <strong>#{settings.slackChannelName}</strong> in <strong>{settings.slackTeamName}</strong>.</>
            }
          />

          {/* WhatsApp channel card */}
          <ChannelCard
            icon={
              <img
                src="https://static.whatsapp.net/rsrc.php/y1/r/FJbTMJqMap7.svg"
                alt=""
                width={20}
                height={20}
                loading="lazy"
                style={{ display: "block" }}
              />
            }
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
                isDirty ? "Save your integrations before testing"
                : noChannelsConfigured ? "Enable at least one integration below"
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

        {/* ── Klaviyo ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Marketing Automation">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              Send inventory events to Klaviyo so you can build flows and campaigns around them.
            </p>

            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
              <p style={{ fontWeight: 600, fontSize: 13, color: "#374151", margin: "0 0 8px" }}>What gets sent to Klaviyo</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#4b5563", lineHeight: 1.8 }}>
                <li><strong>Low Stock Alert</strong> / <strong>Out of Stock Alert</strong> / <strong>Restock Alert</strong> — sent to your own store profile, same events as your other alert channels.</li>
                <li><strong>Back in Stock</strong> — sent per customer, for every shopper who signed up to be notified when a product restocks. Use this to build a real marketing flow off actual back-in-stock signups.</li>
              </ul>
            </div>

            <ConnectRow
              icon={
                <img
                  src="https://www.klaviyo.com/icons/icon-32x32.png"
                  alt=""
                  width={20}
                  height={20}
                  loading="lazy"
                  style={{ display: "block" }}
                />
              }
              title="Klaviyo"
              badge={!isPro ? "Pro" : null}
              connected={isPro && settings.klaviyoEnabled}
              locked={!isPro}
              lockedNode={<s-link href="/app/billing">Upgrade to Pro →</s-link>}
              connectLabel="Connect"
              onConnect={() => { setKlaviyoInput(""); setKlaviyoError(null); setKlaviyoModalOpen(true); }}
              onDisconnect={() => klaviyoDisconnectFetcher.submit({ intent: "disconnect_klaviyo" }, { method: "post" })}
              disconnecting={klaviyoDisconnecting}
              connectedLabel="Sending inventory events to your Klaviyo account."
            />
          </s-section>
        </div>

        {/* ── Shopify Flow ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Flow">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              Stock Alert publishes three Flow triggers — no setup needed here. Build a workflow in{" "}
              <a href="https://admin.shopify.com/admin/apps/flow" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>
                Shopify Flow
              </a>{" "}
              and pick one of these as the trigger:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {FLOW_TRIGGERS.map((t) => (
                <div key={t.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>⚡</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{t.desc}</div>
                  </div>
                </div>
              ))}
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
      </Form>

      {emailModalOpen && (
        <ConnectModal
          title="Email"
          icon={<span style={{ fontSize: 20 }}>✉️</span>}
          onClose={() => setEmailModalOpen(false)}
          onSubmit={() => emailFetcher.submit({ intent: "save_email", notificationEmail: emailInput }, { method: "post" })}
          submitting={emailSaving}
          submitLabel={settings.emailNotifications ? "Save" : "Connect"}
          error={emailError}
        >
          <label style={fieldLabel}>
            Notification email{isPro ? " — multiple allowed" : ""}
          </label>
          <input
            type="text"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={isPro ? "alerts@example.com, team@example.com" : "alerts@example.com"}
            style={inputStyle(!!emailError)}
            autoFocus
          />
          <p style={helpText}>
            {isPro
              ? "Separate multiple addresses with commas."
              : storeEmail
              ? `Leave empty to use store email (${storeEmail}).`
              : "Leave empty to use the store owner email."}
          </p>
        </ConnectModal>
      )}

      {klaviyoModalOpen && (
        <ConnectModal
          title="Klaviyo"
          icon={
            <img
              src="https://www.klaviyo.com/icons/icon-32x32.png"
              alt=""
              width={20}
              height={20}
              loading="lazy"
              style={{ display: "block" }}
            />
          }
          onClose={() => setKlaviyoModalOpen(false)}
          onSubmit={() => klaviyoFetcher.submit({ intent: "save_klaviyo", klaviyoApiKey: klaviyoInput }, { method: "post" })}
          submitting={klaviyoSaving}
          submitLabel="Connect"
          error={klaviyoError}
        >
          <label style={fieldLabel}>Private API key</label>
          <input
            type="password"
            value={klaviyoInput}
            onChange={(e) => setKlaviyoInput(e.target.value)}
            placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            style={inputStyle(!!klaviyoError)}
            autoFocus
          />
          <p style={helpText}>
            Create one in Klaviyo under <strong>Settings → API Keys → Create Private API Key</strong>. Needs
            write access to Events and Profiles.
          </p>
        </ConnectModal>
      )}

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
              {saving ? "Saving…" : "Save Integrations"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function IntegrationsSkeleton() {
  return (
    <>
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

      <div style={{ marginTop: 24 }}>
        <s-section heading="Marketing Automation">
          <SkeletonBlock width="100%" height={56} borderRadius={10} />
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Shopify Flow">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} width="100%" height={48} borderRadius={8} />)}
          </div>
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Outbound Webhook">
          <SkeletonBlock width="100%" height={36} borderRadius={8} />
        </s-section>
      </div>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
