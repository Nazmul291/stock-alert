import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, Form, useNavigation, redirect } from "react-router";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing, session } = await authenticate.admin(request);

  // Already subscribed — skip onboarding
  try {
    const { hasActivePayment } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
      isTest: process.env.TEST_PAYMENT === "true",
    });
    if (hasActivePayment) throw redirect("/app");
  } catch (err) {
    if (err instanceof Response) throw err;
  }

  const url = new URL(request.url);
  const step = Math.min(3, Math.max(1, parseInt(url.searchParams.get("step") ?? "1")));

  // Fetch shop info from Shopify
  let shopInfo = { name: session.shop, email: session.email ?? "", domain: session.shop };
  try {
    const res = await admin.graphql(`query { shop { name email myshopifyDomain } }`);
    const json: any = await res.json();
    const s = json.data?.shop;
    if (s) shopInfo = { name: s.name, email: s.email, domain: s.myshopifyDomain };
  } catch {
    // Fall back to session data
  }

  return { step, shopInfo };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "next_step") {
    const nextStep = form.get("nextStep") as string;
    return redirect(`/app/onboarding?step=${nextStep}`);
  }

  if (intent === "subscribe") {
    const plan = form.get("plan") as string;
    await billing.request({
      plan,
      isTest: process.env.TEST_PAYMENT === "true",
      returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing/confirm`,
    });
  }

  if (intent === "skip") {
    return redirect("/app");
  }

  return null;
};

const STEP_TITLES = ["Welcome to Stock Alert!", "How Stock Alert works", "Choose your plan"];
const STEP_SUBTITLES = [
  "Let's confirm your store details before we get started.",
  "Here's everything Stock Alert does for you automatically.",
  "Start your 30-day free trial — no charge until the trial ends.",
];

const HOW_IT_WORKS = [
  { n: 1, title: "Sync your products", desc: "Import your Shopify inventory in one click to start monitoring stock levels." },
  { n: 2, title: "Set your thresholds", desc: "Define when to be alerted — globally or per product using Shopify metafields." },
  { n: 3, title: "Get instant alerts", desc: "Receive email or Slack notifications the moment stock goes low or runs out." },
  { n: 4, title: "Auto-hide & republish", desc: "Sold-out products are automatically hidden and re-published when restocked." },
];

const PLANS = [
  {
    key: "basic",
    name: "Basic",
    planName: BILLING_PLAN_BASIC,
    price: "$3.99",
    desc: "Great for small stores getting started with inventory alerts.",
    features: ["Auto-hide sold-out products", "Email notifications", "Up to 1,000 products", "Global threshold settings"],
    popular: false,
  },
  {
    key: "pro",
    name: "Professional",
    planName: BILLING_PLAN_PRO,
    price: "$9.99",
    desc: "For stores that need advanced automation and Slack notifications.",
    features: ["Everything in Basic", "Slack notifications", "Per-product thresholds", "Auto-republish on restock", "Up to 10,000 products"],
    popular: true,
  },
];

export default function OnboardingPage() {
  const { step, shopInfo } = useLoaderData<typeof loader>();
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
          {[1, 2, 3].map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center" }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700,
                background: s < step ? "#008060" : s === step ? "#008060" : "#e1e3e5",
                color: s <= step ? "#fff" : "#8c9196",
              }}>
                {s < step ? "✓" : s}
              </div>
              {i < 2 && (
                <div style={{ width: 80, height: 2, background: s < step ? "#008060" : "#e1e3e5", margin: "0 4px" }} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={{ padding: "32px" }}>
          {step === 1 && (
            <Form method="post">
              <input type="hidden" name="intent" value="next_step" />
              <input type="hidden" name="nextStep" value="2" />
              <div style={{ marginBottom: 24 }}>
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
              <p style={{ fontSize: 13, color: "#9ca3af", marginBottom: 24 }}>
                These details are pulled from your Shopify store. Update them in your Shopify admin if anything looks wrong.
              </p>
              <PrimaryButton loading={submitting}>Looks good — continue →</PrimaryButton>
            </Form>
          )}

          {step === 2 && (
            <Form method="post">
              <input type="hidden" name="intent" value="next_step" />
              <input type="hidden" name="nextStep" value="3" />
              <div style={{ marginBottom: 28 }}>
                {HOW_IT_WORKS.map(({ n, title, desc }) => (
                  <div key={n} style={{ display: "flex", gap: 14, marginBottom: 20 }}>
                    <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "#008060", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {n}
                    </div>
                    <div>
                      <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#111827" }}>{title}</p>
                      <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <PrimaryButton loading={submitting}>Got it — choose my plan →</PrimaryButton>
            </Form>
          )}

          {step === 3 && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {PLANS.map((plan) => (
                  <Form key={plan.key} method="post">
                    <input type="hidden" name="intent" value="subscribe" />
                    <input type="hidden" name="plan" value={plan.planName} />
                    <div style={{
                      border: plan.popular ? "2px solid #008060" : "1px solid #e5e7eb",
                      borderRadius: 10, padding: 20, position: "relative",
                      background: plan.popular ? "#f1f8f5" : "#fff", height: "100%",
                    }}>
                      {plan.popular && (
                        <div style={{ position: "absolute", top: -1, left: 16, background: "#008060", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: "0 0 6px 6px", letterSpacing: 0.5 }}>
                          MOST POPULAR
                        </div>
                      )}
                      <h3 style={{ margin: "8px 0 2px", fontSize: 16, fontWeight: 700 }}>{plan.name}</h3>
                      <p style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>{plan.price}<span style={{ fontSize: 12, fontWeight: 400, color: "#6b7280" }}>/mo</span></p>
                      <p style={{ margin: "0 0 12px", fontSize: 12, color: "#6b7280" }}>{plan.desc}</p>
                      <ul style={{ paddingLeft: 16, margin: "0 0 16px", fontSize: 13, color: "#374151", lineHeight: 1.8 }}>
                        {plan.features.map((f) => <li key={f}>{f}</li>)}
                      </ul>
                      <button type="submit" disabled={submitting} style={{
                        width: "100%", padding: "8px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                        background: plan.popular ? "#008060" : "#111827", color: "#fff",
                        opacity: submitting ? 0.6 : 1,
                      }}>
                        {submitting ? "Redirecting…" : `Start free trial — ${plan.name}`}
                      </button>
                    </div>
                  </Form>
                ))}
              </div>
              <p style={{ textAlign: "center", fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>
                All plans include a 30-day free trial. No charge until the trial ends.
              </p>
              <Form method="post" style={{ textAlign: "center" }}>
                <input type="hidden" name="intent" value="skip" />
                <button type="submit" style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>
                  Skip for now
                </button>
              </Form>
            </div>
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
