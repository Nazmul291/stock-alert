import { Form, useNavigation } from "react-router";
import { PLAN_LIMITS, formatMaxProducts } from "../../lib/plan-limits";

// Purchasable, in ascending tier order — drives both the display order and
// the "Upgrade to X" vs "Switch to X" button label (comparing index).
const PURCHASABLE_PLAN_KEYS = ["basic", "pro"] as const;
// Display order for the whole card row, including non-purchasable previews.
const PLAN_CARD_KEYS = ["basic", "pro", "enterprise"] as const;

// Per-tier visual accents that PLAN_LIMITS has no reason to know about
// (colors, "Most Popular" ribbon) — content (name/price/features/status)
// always comes from PLAN_LIMITS, never duplicated here.
const PLAN_ACCENT: Record<(typeof PLAN_CARD_KEYS)[number], { border: string; badgeBg: string; badgeColor: string; buttonBg: string | null; ribbon?: string }> = {
  basic: { border: "#3b82f6", badgeBg: "#dbeafe", badgeColor: "#1e40af", buttonBg: null },
  pro: { border: "#059669", badgeBg: "#d1fae5", badgeColor: "#065f46", buttonBg: "#059669", ribbon: "Most Popular" },
  enterprise: { border: "#e5e7eb", badgeBg: "#e0e7ff", badgeColor: "#4338ca", buttonBg: null },
};

export function BillingPlanCards({ activePlan }: { activePlan: "basic" | "pro" | null }) {
  const nav = useNavigation();
  const loading = nav.state === "submitting";
  const submittingPlan = loading ? (nav.formData?.get("plan") as string | null) : null;
  const activeTierIndex = activePlan ? PURCHASABLE_PLAN_KEYS.indexOf(activePlan) : -1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${PLAN_CARD_KEYS.length}, 1fr)`, gap: 20 }}>
      {PLAN_CARD_KEYS.map((key) => {
        const plan = PLAN_LIMITS[key];
        const accent = PLAN_ACCENT[key];
        const isCurrent = activePlan === key;
        const isPurchasable = plan.status === "active";
        const productsBullet = Number.isFinite(plan.maxProducts)
          ? `Up to ${formatMaxProducts(plan.maxProducts)} products`
          : "Unlimited products";
        const bullets = [...plan.features, productsBullet, "30-day free trial"];

        const tierIndex = isPurchasable ? PURCHASABLE_PLAN_KEYS.indexOf(key as "basic" | "pro") : -1;
        const buttonLabel =
          submittingPlan === key
            ? "Processing…"
            : activeTierIndex === -1
            ? "Start free trial"
            : tierIndex > activeTierIndex
            ? `Upgrade to ${plan.name}`
            : `Switch to ${plan.name}`;

        return (
          <div
            key={key}
            style={{
              border: isCurrent ? `2px solid ${accent.border}` : "1px solid #e5e7eb",
              borderRadius: 10, padding: 24, position: "relative", display: "flex", flexDirection: "column",
              opacity: plan.status === "coming_soon" ? 0.85 : 1,
            }}
          >
            {isCurrent && (
              <span style={{ position: "absolute", top: 12, right: 12, background: accent.badgeBg, color: accent.badgeColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                Current Plan
              </span>
            )}
            {!isCurrent && plan.status === "coming_soon" && (
              <span style={{ position: "absolute", top: 12, right: 12, background: accent.badgeBg, color: accent.badgeColor, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>
                Coming Soon
              </span>
            )}
            {accent.ribbon && (
              <span style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#008060", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 12px", borderRadius: 12, whiteSpace: "nowrap" }}>
                {accent.ribbon}
              </span>
            )}
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>{plan.name}</h2>
            <p style={{ fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>
              {plan.price}<span style={{ fontSize: 14, fontWeight: 400, color: "#6b7280" }}>/month</span>
            </p>
            <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 16px" }}>30-day free trial</p>
            <ul style={{ paddingLeft: 18, margin: "0 0 20px", lineHeight: 1.8, flex: 1 }}>
              {bullets.map((f) => <li key={f} style={{ fontSize: 14 }}>{f}</li>)}
            </ul>
            {!isPurchasable ? (
              <button type="button" disabled style={{ width: "100%", padding: "8px 16px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", color: "#9ca3af", cursor: "not-allowed", fontSize: 14 }}>
                Coming Soon
              </button>
            ) : !isCurrent ? (
              <Form method="post">
                <input type="hidden" name="plan" value={key} />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%", padding: "8px 16px", borderRadius: 6,
                    border: accent.buttonBg ? "none" : "1px solid #d1d5db",
                    background: accent.buttonBg ?? "#fff",
                    color: accent.buttonBg ? "#fff" : "#111827",
                    cursor: loading ? "not-allowed" : "pointer", fontSize: 14, fontWeight: accent.buttonBg ? 600 : 400,
                  }}
                >
                  {buttonLabel}
                </button>
              </Form>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
