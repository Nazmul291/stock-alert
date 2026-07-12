import { Form } from "react-router";
import { OnboardingPrimaryButton } from "./OnboardingPrimaryButton";

export function OnboardingConfirmStep({ shopInfo, submitting }: {
  shopInfo: { name: string; domain: string; email: string };
  submitting: boolean;
}) {
  return (
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

      <OnboardingPrimaryButton loading={submitting}>Looks good — continue →</OnboardingPrimaryButton>
    </Form>
  );
}
