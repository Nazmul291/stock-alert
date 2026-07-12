import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useSearchParams, Form, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { sendTestNotification } from "../lib/notifications";
import { getCachedSettings, getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { revokeSlackToken, mintSlackOAuthState } from "../lib/slack-oauth.server";
import { mintAsanaOAuthState } from "../lib/asana-oauth.server";
import { sendWhatsAppTemplate } from "../lib/whatsapp.server";
import { SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { IntegrationsData } from "../lib/integrations-data.server";
import { useSSEData } from "../hooks/use-sse-data";
import { TestResultBanner, type TestResult } from "../components/IntegrationControls";
import { EmailIntegrationSection } from "../components/integrations/EmailIntegrationSection";
import { SlackIntegrationSection } from "../components/integrations/SlackIntegrationSection";
import { WhatsAppIntegrationSection } from "../components/integrations/WhatsAppIntegrationSection";
import { AsanaIntegrationSection } from "../components/integrations/AsanaIntegrationSection";
import { KlaviyoIntegrationSection } from "../components/integrations/KlaviyoIntegrationSection";
import { FlowIntegrationSection } from "../components/integrations/FlowIntegrationSection";
import { OutboundWebhookSection } from "../components/integrations/OutboundWebhookSection";
import { TestNotificationButton } from "../components/integrations/TestNotificationButton";
import { UnsavedChangesBar } from "../components/UnsavedChangesBar";
import { IntegrationsSkeleton } from "../components/integrations/IntegrationsSkeleton";
import { canUseFeature } from "../lib/plan-limits";

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
  const asanaConnectToken = await mintAsanaOAuthState({ shop, host });
  return { token, slackConnectToken, asanaConnectToken };
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
    (settings?.klaviyoEnabled && settings?.klaviyoApiKey) ||
    (settings?.asanaEnabled && settings?.asanaAccessToken)
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
        whatsappPhoneVerified: settings.whatsappPhoneVerified,
        klaviyoEnabled: settings.klaviyoEnabled,
        klaviyoApiKey: settings.klaviyoApiKey,
        asanaEnabled: settings.asanaEnabled,
        asanaAccessToken: settings.asanaAccessToken,
        asanaWorkspaceGid: settings.asanaWorkspaceGid,
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

  // WhatsApp — one number Stock Alert owns sends to whatever personal phone
  // the merchant enters, so "connecting" is just proving they own that number:
  // send a code, they type it back. No Meta login involved at all.
  if (intent === "send_whatsapp_code") {
    const phone = ((form.get("phone") as string) ?? "").trim();
    if (!phone) {
      return { intent: "send_whatsapp_code", success: false as const, error: "Enter a WhatsApp number." };
    }

    const settings = await getCachedSettings(shop);
    // A code was already sent less than a minute ago (expiry is now+10min) —
    // block hammering "resend" rather than firing a fresh WhatsApp message
    // every click.
    if (settings?.whatsappVerificationExpiresAt && settings.whatsappVerificationExpiresAt.getTime() - Date.now() > 9 * 60 * 1000) {
      return { intent: "send_whatsapp_code", success: false as const, error: "Please wait a moment before requesting another code." };
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    try {
      await sendWhatsAppTemplate(phone, "stock_alert_otp", [code]);
    } catch (err) {
      return { intent: "send_whatsapp_code", success: false as const, error: err instanceof Error ? err.message : "Could not send the verification code." };
    }

    await prisma.storeSettings.upsert({
      where: { shop },
      update: { whatsappPhone: phone, whatsappVerificationCode: code, whatsappVerificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      create: { shop, whatsappPhone: phone, whatsappVerificationCode: code, whatsappVerificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
    });
    invalidateShopCache(shop);
    return { intent: "send_whatsapp_code", success: true };
  }

  if (intent === "verify_whatsapp_code") {
    const code = ((form.get("code") as string) ?? "").trim();
    const settings = await getCachedSettings(shop);
    const codeMatches = !!code && !!settings?.whatsappVerificationCode && code === settings.whatsappVerificationCode;
    const notExpired = !!settings?.whatsappVerificationExpiresAt && settings.whatsappVerificationExpiresAt.getTime() > Date.now();
    if (!codeMatches || !notExpired) {
      return { intent: "verify_whatsapp_code", success: false as const, error: "Incorrect or expired code." };
    }

    await prisma.storeSettings.update({
      where: { shop },
      data: {
        whatsappPhoneVerified: true,
        whatsappNotifications: true,
        whatsappVerificationCode: null,
        whatsappVerificationExpiresAt: null,
      },
    });
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "verify_whatsapp_code", success: true };
  }

  if (intent === "disconnect_whatsapp") {
    await prisma.storeSettings.upsert({
      where: { shop },
      update: {
        whatsappNotifications: false,
        whatsappPhoneVerified: false,
        whatsappPhone: null,
        whatsappVerificationCode: null,
        whatsappVerificationExpiresAt: null,
      },
      create: { shop, whatsappNotifications: false },
    });
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "disconnect_whatsapp", success: true };
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
      if (!canUseFeature(plan, "multipleRecipients") && addresses.length > 1) {
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
    if (!canUseFeature(storeSession?.plan, "klaviyoIntegration")) {
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

  // Asana — connected via OAuth (same new-tab pattern as Slack, since
  // Asana's consent screen can't render inside Shopify's iframe either), then
  // per-event project/section mappings live in their own table since it's
  // naturally 0-3 rows per shop, not flat StoreSettings columns.
  if (intent === "disconnect_asana") {
    await prisma.$transaction([
      prisma.storeSettings.upsert({
        where: { shop },
        update: {
          asanaEnabled: false,
          asanaAccessToken: null,
          asanaRefreshToken: null,
          asanaTokenExpiresAt: null,
          asanaUserName: null,
          asanaWorkspaceGid: null,
          asanaWorkspaceName: null,
        },
        create: { shop, asanaEnabled: false },
      }),
      prisma.asanaEventMapping.deleteMany({ where: { shop } }),
    ]);
    invalidateShopCache(shop);
    await syncNotificationsConfigured(shop);
    return { intent: "disconnect_asana", success: true };
  }

  if (intent === "select_asana_workspace") {
    const storeSessionForAsana = await getCachedSession(shop);
    if (!canUseFeature(storeSessionForAsana?.plan, "asanaTaskCreation")) {
      return { intent: "select_asana_workspace", success: false as const, error: "Asana is a Professional plan feature." };
    }
    const workspaceGid = (form.get("workspaceGid") as string) ?? "";
    const workspaceName = (form.get("workspaceName") as string) ?? "";
    if (!workspaceGid) {
      return { intent: "select_asana_workspace", success: false as const, error: "Choose a workspace." };
    }
    // Projects belong to a specific workspace — mappings picked under the
    // previous workspace would point at projects the new one can't see.
    await prisma.$transaction([
      prisma.storeSettings.update({ where: { shop }, data: { asanaWorkspaceGid: workspaceGid, asanaWorkspaceName: workspaceName } }),
      prisma.asanaEventMapping.deleteMany({ where: { shop } }),
    ]);
    invalidateShopCache(shop);
    return { intent: "select_asana_workspace", success: true };
  }

  if (intent === "save_asana_mapping") {
    const storeSessionForAsana = await getCachedSession(shop);
    if (!canUseFeature(storeSessionForAsana?.plan, "asanaTaskCreation")) {
      return { intent: "save_asana_mapping", success: false as const, error: "Asana is a Professional plan feature." };
    }
    const eventType = (form.get("eventType") as string) ?? "";
    const projectGid = (form.get("projectGid") as string) ?? "";
    const projectName = (form.get("projectName") as string) ?? "";
    const sectionGid = ((form.get("sectionGid") as string) ?? "").trim() || null;
    const sectionName = ((form.get("sectionName") as string) ?? "").trim() || null;
    const taskModeRaw = (form.get("taskMode") as string) ?? "multi_task";
    const taskMode = ["multi_task", "daily", "lifetime"].includes(taskModeRaw) ? taskModeRaw : "multi_task";
    if (!["low_stock", "out_of_stock", "restock"].includes(eventType) || !projectGid) {
      return { intent: "save_asana_mapping", success: false as const, error: "Missing project selection." };
    }
    await prisma.asanaEventMapping.upsert({
      where: { shop_eventType: { shop, eventType } },
      // Reset the tracked parent task on any change — a stale gid from
      // before a mode/project/section change would otherwise get reused.
      update: { projectGid, projectName, sectionGid, sectionName, taskMode, currentTaskGid: null, currentTaskDate: null },
      create: { shop, eventType, projectGid, projectName, sectionGid, sectionName, taskMode },
    });
    return { intent: "save_asana_mapping", success: true, eventType };
  }

  // General save — Outbound Webhook only. Email, Slack, Klaviyo, WhatsApp, and
  // are each managed by their own scoped connect/disconnect intents above, not
  // this form.
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";

  const data = {
    ...(canUseFeature(plan, "outboundWebhook") ? { outboundWebhookUrl: ((form.get("outboundWebhookUrl") as string) ?? "").trim() || null } : {}),
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

export default function IntegrationsPage() {
  const { token, slackConnectToken, asanaConnectToken } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<IntegrationsData>(
    `/api/integrations-stream?token=${encodeURIComponent(token)}`,
  );
  const [searchParams] = useSearchParams();
  const slackError = searchParams.get("slack_error") === "1";
  const asanaError = searchParams.get("asana_error") === "1";

  return (
    <s-page heading="Integrations" sub-heading="Connect Stock Alert to Slack, WhatsApp, Shopify Flow, Klaviyo, Asana, and your own systems">
      {slackError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#991b1b", fontSize: 14 }}>
          Couldn&apos;t connect to Slack — please try again.
        </div>
      )}
      {asanaError && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#991b1b", fontSize: 14 }}>
          Couldn&apos;t connect to Asana — please try again.
        </div>
      )}
      {error ? (
        <SSEErrorRetry message={error} onRetry={retry} />
      ) : data ? (
        <IntegrationsContent data={data} slackConnectToken={slackConnectToken} asanaConnectToken={asanaConnectToken} retry={retry} />
      ) : (
        <IntegrationsSkeleton />
      )}
    </s-page>
  );
}

function IntegrationsContent({
  data, slackConnectToken, asanaConnectToken, retry,
}: {
  data: IntegrationsData;
  slackConnectToken: string;
  asanaConnectToken: string;
  retry: () => void;
}) {
  const { plan, storeEmail, settings, asanaMappings } = data;
  const canSlack = canUseFeature(plan, "slackNotifications");
  const canAsana = canUseFeature(plan, "asanaTaskCreation");
  const canKlaviyo = canUseFeature(plan, "klaviyoIntegration");
  const canOutboundWebhook = canUseFeature(plan, "outboundWebhook");
  const canMultipleRecipients = canUseFeature(plan, "multipleRecipients");
  const asanaMappingByEvent = Object.fromEntries(asanaMappings.map((m) => [m.eventType, m]));

  const saveFetcher = useFetcher<typeof action>();
  const saving = saveFetcher.state !== "idle";
  const formRef = useRef<HTMLFormElement>(null);

  const [outboundWebhookUrl, setOutboundWebhookUrl] = useState(settings.outboundWebhookUrl);
  const [isDirty, setIsDirty] = useState(false);

  function markDirty() {
    setIsDirty(true);
  }

  function handleDiscard() {
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
  const saveSuccess = saveData && saveData.intent === "save" && saveData.success;

  useEffect(() => {
    const d = saveFetcher.data as any;
    if (d?.intent === "save" && d?.success) setIsDirty(false);
  }, [saveFetcher.data]);

  function handleSave() {
    const fd = new FormData(formRef.current ?? undefined);
    fd.set("outboundWebhookUrl", outboundWebhookUrl);
    saveFetcher.submit(fd, { method: "post" });
  }

  const noChannelsConfigured =
    !settings.emailNotifications &&
    !(settings.slackConnected && canSlack) &&
    !(settings.klaviyoEnabled && canKlaviyo) &&
    !settings.whatsappPhoneVerified;

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

          <EmailIntegrationSection
            notificationEmail={settings.notificationEmail}
            emailNotifications={settings.emailNotifications}
            storeEmail={storeEmail}
            canMultipleRecipients={canMultipleRecipients}
            retry={retry}
          />

          <SlackIntegrationSection
            connected={settings.slackConnected}
            channelName={settings.slackChannelName}
            teamName={settings.slackTeamName}
            canSlack={canSlack}
            slackConnectToken={slackConnectToken}
            retry={retry}
          />

          <WhatsAppIntegrationSection
            phone={settings.whatsappPhone}
            phoneVerified={settings.whatsappPhoneVerified}
            retry={retry}
          />

          <TestNotificationButton
            testing={testing}
            disabled={noChannelsConfigured || isDirty}
            disabledReason={
              isDirty ? "Save your integrations before testing"
              : noChannelsConfigured ? "Enable at least one integration below"
              : undefined
            }
            isDirty={isDirty}
            onTest={() => testFetcher.submit({ intent: "test_notification" }, { method: "post" })}
          />
        </s-section>

        <AsanaIntegrationSection
          canAsana={canAsana}
          connected={settings.asanaConnected}
          userName={settings.asanaUserName}
          workspaceName={settings.asanaWorkspaceName}
          asanaConnectToken={asanaConnectToken}
          mappingByEvent={asanaMappingByEvent}
          retry={retry}
        />

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

            <KlaviyoIntegrationSection canKlaviyo={canKlaviyo} enabled={settings.klaviyoEnabled} retry={retry} />
          </s-section>
        </div>

        <FlowIntegrationSection />

        <OutboundWebhookSection
          value={outboundWebhookUrl}
          onChange={(v) => { setOutboundWebhookUrl(v); markDirty(); }}
          canUse={canOutboundWebhook}
        />
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

      {isDirty && (
        <UnsavedChangesBar saving={saving} onDiscard={handleDiscard} onSave={handleSave} />
      )}
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
