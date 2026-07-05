import { useState, useRef, useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Form, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { SkeletonBlock, SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { SettingsData } from "../lib/settings-data.server";
import { useSSEData } from "../hooks/use-sse-data";
import { Toggle, inputStyle, fieldLabel, helpText } from "../components/IntegrationControls";

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
    digestFrequency: plan === "pro" && rawDigestFrequency === "daily" ? "daily" : "weekly",
    supplierLeadTimeDays: !isNaN(rawLeadTime) && rawLeadTime >= 1 && rawLeadTime <= 90 ? rawLeadTime : 7,
    monitoringFilter: (["all", "collection", "tags"] as const).includes(form.get("monitoringFilter") as any) ? form.get("monitoringFilter") as string : "all",
    monitoringCollectionId: ((form.get("monitoringCollectionId") as string) ?? "").trim() || null,
    monitoringTags: ((form.get("monitoringTags") as string) ?? "").trim() || null,
    ...(plan === "pro" ? {
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

const THRESHOLD_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 50];

export default function SettingsPage() {
  const { token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<SettingsData>(
    `/api/settings-stream?token=${encodeURIComponent(token)}`,
  );

  return (
    <s-page heading="Settings" sub-heading="Configure your inventory monitoring preferences">
      {error ? (
        <SSEErrorRetry message={error} onRetry={retry} />
      ) : data ? (
        <SettingsContent data={data} />
      ) : (
        <SettingsSkeleton />
      )}

      {/* ── Theme App Embed — static, doesn't depend on loaded settings ── */}
      <div style={{ marginTop: 24 }}>
        <s-section heading="Theme App Embed">
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <p style={{ fontSize: 14, color: "#374151", margin: "0 0 12px", lineHeight: 1.6 }}>
                The "Notify Me When Available" button is powered by a <strong>Theme App Embed</strong>.
                It automatically replaces the Add to Cart button on out-of-stock products — no code required.
              </p>
              <ol style={{ fontSize: 14, color: "#374151", margin: 0, paddingLeft: 18, lineHeight: 2 }}>
                <li>Go to <strong>Online Store → Themes → Customize</strong></li>
                <li>Open <strong>App embeds</strong> in the left sidebar</li>
                <li>Toggle on <strong>Back in Stock</strong></li>
                <li>Save — the button is now live on all out-of-stock products</li>
              </ol>
            </div>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#065f46", minWidth: 220 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>What customers see</div>
              <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
                <li>Product info + image in popup</li>
                <li>First name, last name &amp; email form</li>
                <li>One email when the product restocks</li>
                <li>Button changes to ✓ Notified</li>
              </ul>
            </div>
          </div>
        </s-section>
      </div>

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
  const { plan, settings } = data;
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

  const isPro = plan === "pro";

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

        {/* ── Digest Emails ── */}
        <div style={{ marginTop: 24 }}>
          <s-section heading="Digest Emails">
            <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
              A periodic summary of at-risk and out-of-stock products sent to your notification email —
              set that (and Slack, WhatsApp, Klaviyo, Shopify Flow) on{" "}
              <s-link href="/app/integrations">Integrations</s-link>.{" "}
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
        <s-section heading="Monitoring Scope">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} width="100%" height={56} borderRadius={8} />)}
          </div>
        </s-section>
      </div>
    </>
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
                loading="lazy"
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
    { label: "Shopify Flow triggers",           pro: false },
    { label: `Up to ${isPro ? "10,000" : "1,000"} products`, pro: false },
    { label: "Slack Connect",                   pro: true  },
    { label: "Klaviyo integration",             pro: true  },
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

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
