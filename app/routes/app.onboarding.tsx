import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, Form, useNavigation, redirect } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../lib/billing-plans";
import prisma from "../db.server";
import { getIsTestStore } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);
  const shop = session.shop;
  const isTest = await getIsTestStore(admin);

  // Already subscribed — skip onboarding
  try {
    const { hasActivePayment } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
      isTest,
    });
    if (hasActivePayment) throw redirect("/app");
  } catch (err) {
    if (err instanceof Response) throw err;
  }

  const url = new URL(request.url);
  const step = Math.min(2, Math.max(1, parseInt(url.searchParams.get("step") ?? "1")));

  // If all setup steps are done, skip straight to billing
  const setupProgress = await prisma.setupProgress.findUnique({ where: { shop } });
  const allStepsDone =
    setupProgress?.appInstalled &&
    setupProgress?.globalSettingsConfigured &&
    setupProgress?.notificationsConfigured;
  if (allStepsDone) {
    const params = new URLSearchParams();
    const host = url.searchParams.get("host");
    const shopParam = url.searchParams.get("shop");
    const embedded = url.searchParams.get("embedded") ?? "1";
    if (host) params.set("host", host);
    if (shopParam) params.set("shop", shopParam);
    params.set("embedded", embedded);
    throw redirect(`/app/billing?${params.toString()}`);
  }

  // Fetch shop info
  let shopInfo = { name: shop, email: "", domain: shop };
  try {
    const res = await admin.graphql(`query { shop { name email myshopifyDomain } }`);
    const json: any = await res.json();
    const s = json.data?.shop;
    if (s) shopInfo = { name: s.name, email: s.email, domain: s.myshopifyDomain };
  } catch {
    // Fall back to session data
  }

  // Load existing settings for pre-filling step 2
  const settings = await prisma.storeSettings.findUnique({ where: { shop } });
  const existingSettings = {
    lowStockThreshold: settings?.lowStockThreshold ?? 5,
    autoHideEnabled: settings?.autoHideEnabled ?? false,
    autoRepublishEnabled: settings?.autoRepublishEnabled ?? false,
  };

  return { step, shopInfo, existingSettings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;
  const url = new URL(request.url);
  const host = url.searchParams.get("host");
  const shopParam = url.searchParams.get("shop");
  const embedded = url.searchParams.get("embedded") ?? "1";

  const buildParams = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams({ embedded, ...extra });
    if (host) p.set("host", host);
    if (shopParam) p.set("shop", shopParam);
    return p.toString();
  };

  if (intent === "confirm_install") {
    await prisma.setupProgress.upsert({
      where: { shop },
      update: { appInstalled: true },
      create: {
        shop,
        appInstalled: true,
        globalSettingsConfigured: false,
        notificationsConfigured: false,
        productThresholdsConfigured: false,
        firstProductTracked: false,
      },
    });
    return redirect(`/app/onboarding?${buildParams({ step: "2" })}`);
  }

  if (intent === "save_settings") {
    const data = {
      lowStockThreshold: parseInt(form.get("lowStockThreshold") as string) || 5,
      autoHideEnabled: form.get("autoHideEnabled") === "true",
      autoRepublishEnabled: form.get("autoRepublishEnabled") === "true",
    };

    // Auto-set notification email from the shop's owner email
    let notificationEmail: string | null = null;
    try {
      const res = await admin.graphql(`query { shop { email } }`);
      const json: any = await res.json();
      notificationEmail = json.data?.shop?.email || null;
    } catch {
      // Non-fatal — leave null, user can set it in Settings
    }

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
        appInstalled: true,
        globalSettingsConfigured: true,
        notificationsConfigured: true,
        productThresholdsConfigured: false,
        firstProductTracked: false,
      },
    });
    return redirect(`/app/billing?${buildParams()}`);
  }

  return null;
};

const STEP_TITLES = ["Welcome to Stock Alert!", "Configure inventory settings"];
const STEP_SUBTITLES = [
  "Let's confirm your store details before we get started.",
  "Set your low-stock threshold and automation preferences.",
];
const STEP_LABELS = ["App Installed", "Global Settings"];

const THRESHOLD_OPTIONS = [1, 3, 5, 10, 15, 20, 25, 50];

export default function OnboardingPage() {
  const { step, shopInfo, existingSettings } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submitting = nav.state === "submitting";

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 16px" }}>
      <div style={{ width: "100%", maxWidth: 620, background: "#fff", borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ background: "#008060", padding: "28px 32px 24px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", borderRadius: 20, padding: "4px 12px", marginBottom: 16 }}>
            <span style={{ color: "#fff", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>✦ STOCK ALERT SETUP</span>
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, color: "#fff" }}>{STEP_TITLES[step - 1]}</h1>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{STEP_SUBTITLES[step - 1]}</p>
        </div>

        {/* Step indicators */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "20px 32px", borderBottom: "1px solid #f3f4f6" }}>
          {[1, 2].map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700,
                  background: s < step ? "#008060" : s === step ? "#008060" : "#e1e3e5",
                  color: s <= step ? "#fff" : "#8c9196",
                }}>
                  {s < step ? "✓" : s}
                </div>
                <span style={{ fontSize: 11, color: s <= step ? "#008060" : "#8c9196", fontWeight: s === step ? 700 : 400, whiteSpace: "nowrap" }}>
                  {STEP_LABELS[s - 1]}
                </span>
              </div>
              {i < 1 && (
                <div style={{ width: 80, height: 2, background: s < step ? "#008060" : "#e1e3e5", margin: "0 8px", marginBottom: 18 }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: "32px" }}>
          {/* Step 1: Confirm store details */}
          {step === 1 && (
            <Form method="post">
              <input type="hidden" name="intent" value="confirm_install" />
              <div style={{ marginBottom: 20 }}>
                {[
                  { label: "Store name", value: shopInfo.name },
                  { label: "Domain", value: shopInfo.domain },
                  { label: "Owner email", value: shopInfo.email || "Not available" },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
                    <span style={{ fontSize: 14, color: "#6b7280" }}>{label}</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{value}</span>
                  </div>
                ))}
              </div>

              {/* Default notification info */}
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 24 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#166534" }}>
                  <strong>Notifications:</strong> By default, we'll send stock alerts to{" "}
                  <strong>{shopInfo.email || "your store owner email"}</strong>.
                  To opt out or explore other notification options (Slack, custom email), visit the{" "}
                  <strong>Settings</strong> page anytime.
                </p>
              </div>

              <PrimaryButton loading={submitting}>Looks good — continue →</PrimaryButton>
            </Form>
          )}

          {/* Step 2: Global settings */}
          {step === 2 && (
            <Form method="post">
              <input type="hidden" name="intent" value="save_settings" />

              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: 14, marginBottom: 6, color: "#111827" }}>
                  Low stock threshold
                </label>
                <select
                  name="lowStockThreshold"
                  defaultValue={existingSettings.lowStockThreshold}
                  style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "8px 12px", fontSize: 14, width: "100%" }}
                >
                  {THRESHOLD_OPTIONS.map((v) => (
                    <option key={v} value={v}>{v} {v === 1 ? "item" : "items"}</option>
                  ))}
                </select>
                <p style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>You'll be alerted when stock falls at or below this amount.</p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <ToggleField
                  label="Auto-hide sold-out products"
                  name="autoHideEnabled"
                  defaultChecked={existingSettings.autoHideEnabled}
                  helpText="Products with zero inventory are automatically unpublished from your store."
                />
              </div>

              <div style={{ marginBottom: 28 }}>
                <ToggleField
                  label="Auto-republish when restocked"
                  name="autoRepublishEnabled"
                  defaultChecked={existingSettings.autoRepublishEnabled}
                  helpText="Products are automatically republished when inventory is added back."
                />
              </div>

              <PrimaryButton loading={submitting}>Finish setup →</PrimaryButton>
            </Form>
          )}
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <button type="submit" disabled={loading} style={{
      width: "100%", padding: "12px 20px", borderRadius: 8, border: "none",
      background: loading ? "#b5b5b5" : "#008060", color: "#fff",
      fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
    }}>
      {loading ? "Loading…" : children}
    </button>
  );
}

function ToggleField({ label, name, defaultChecked, helpText }: { label: string; name: string; defaultChecked: boolean; helpText?: string }) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
        <input type="hidden" name={name} value="false" />
        <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} style={{ width: 16, height: 16 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{label}</span>
      </label>
      {helpText && <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2, marginLeft: 24 }}>{helpText}</p>}
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
