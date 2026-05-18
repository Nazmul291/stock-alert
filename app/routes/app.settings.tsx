import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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
    return { success: true, message: "All product data reset successfully." };
  }

  // Save settings
  const data = {
    autoHideEnabled: form.get("autoHideEnabled") === "true",
    autoRepublishEnabled: form.get("autoRepublishEnabled") === "true",
    lowStockThreshold: parseInt(form.get("lowStockThreshold") as string) || 5,
    emailNotifications: form.get("emailNotifications") === "true",
    slackNotifications: form.get("slackNotifications") === "true",
    notificationEmail: (form.get("notificationEmail") as string) || null,
    slackWebhookUrl: (form.get("slackWebhookUrl") as string) || null,
  };

  await prisma.storeSettings.upsert({
    where: { shop },
    update: data,
    create: { shop, ...data },
  });

  // Update setup progress
  const hasNotifications = !!(data.notificationEmail || data.slackWebhookUrl);
  const isConfigured = data.lowStockThreshold !== 5 || !!data.notificationEmail;

  await prisma.setupProgress.upsert({
    where: { shop },
    update: {
      globalSettingsConfigured: isConfigured,
      notificationsConfigured: hasNotifications,
    },
    create: {
      shop,
      appInstalled: true,
      globalSettingsConfigured: isConfigured,
      notificationsConfigured: hasNotifications,
      productThresholdsConfigured: false,
      firstProductTracked: false,
    },
  });

  return { success: true, message: "Settings saved successfully." };
};

const THRESHOLD_OPTIONS = [1, 3, 5, 10, 15, 20, 25, 50];

export default function SettingsPage() {
  const { shop, plan, settings } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const saving = nav.state === "submitting";

  return (
    <s-page heading="Settings" sub-heading="Configure your inventory monitoring preferences">
      {actionData?.success && (
        <div style={{ background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "10px 14px", marginBottom: 16, color: "#065f46" }}>
          {actionData.message}
        </div>
      )}

      <Form method="post">
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
            <select name="lowStockThreshold" defaultValue={settings.lowStockThreshold} aria-label="Low stock threshold" style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }}>
              {THRESHOLD_OPTIONS.map((v) => (
                <option key={v} value={v}>{v} {v === 1 ? "item" : "items"}</option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Alert when inventory falls below this amount.</p>
          </div>
        </s-section>

        <s-section heading="Notifications">
          <ToggleField
            label="Email notifications"
            name="emailNotifications"
            checked={settings.emailNotifications}
          />

          {settings.emailNotifications && (
            <div style={{ marginTop: 8 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Notification email</label>
              <input type="email" name="notificationEmail" defaultValue={settings.notificationEmail} placeholder="alerts@example.com"
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }} />
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>Leave empty to use the store owner email.</p>
            </div>
          )}

          <ToggleField
            label="Slack notifications"
            name="slackNotifications"
            checked={settings.slackNotifications}
            helpText={plan !== "pro" ? "Requires Professional plan." : undefined}
          />

          {settings.slackNotifications && (
            <div style={{ marginTop: 8 }}>
              {plan !== "pro" && (
                <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 12px", fontSize: 13, color: "#92400e", marginBottom: 8 }}>
                  Slack notifications require the Professional plan.
                </div>
              )}
              <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Slack webhook URL</label>
              <input type="url" name="slackWebhookUrl" defaultValue={settings.slackWebhookUrl} placeholder="https://hooks.slack.com/services/..."
                disabled={plan !== "pro"}
                style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14, opacity: plan !== "pro" ? 0.5 : 1 }} />
              <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                Create a Slack webhook at{" "}
                <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>api.slack.com/messaging/webhooks</a>
              </p>
            </div>
          )}
        </s-section>

        <s-section heading="">
          <button type="submit" disabled={saving} style={{ padding: "8px 20px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </s-section>
      </Form>

      {/* Danger zone */}
      <s-section heading="Danger Zone">
        <s-paragraph>
          Reset all synced product data, settings, and alert history for this store. This cannot be undone.
        </s-paragraph>
        <Form method="post" onSubmit={(e) => { if (!confirm("Reset all product data? This cannot be undone.")) e.preventDefault(); }}>
          <input type="hidden" name="intent" value="reset" />
          <button type="submit" disabled={saving} style={{ padding: "8px 20px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            {saving ? "Resetting…" : "Reset All Product Data"}
          </button>
        </Form>
      </s-section>
    </s-page>
  );
}

function ToggleField({ label, name, checked, disabled, helpText }: { label: string; name: string; checked: boolean; disabled?: boolean; helpText?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}>
        <input type="hidden" name={name} value="false" />
        <input type="checkbox" name={name} value="true" defaultChecked={checked} disabled={disabled}
          style={{ width: 16, height: 16 }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
      </label>
      {helpText && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2, marginLeft: 24 }}>{helpText}</p>}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
