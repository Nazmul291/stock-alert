import { useFetcher } from "react-router";
import { OnboardingPrimaryButton } from "./OnboardingPrimaryButton";
import { OnboardingToggleField } from "./OnboardingToggleField";

const THRESHOLD_OPTIONS = [1, 3, 5, 10, 15, 20, 25, 50];

// Uses a fetcher instead of <Form> — see the comment in TermsAcceptanceStep.tsx.
export function OnboardingSettingsStep({ existingSettings, onSubmit }: {
  existingSettings: { lowStockThreshold: number; autoHideEnabled: boolean; autoRepublishEnabled: boolean };
  onSubmit?: () => void;
}) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" onSubmit={onSubmit}>
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
        <OnboardingToggleField
          label="Auto-hide sold-out products"
          name="autoHideEnabled"
          defaultChecked={existingSettings.autoHideEnabled}
          helpText="Products with zero inventory are automatically unpublished from your store."
        />
      </div>

      <div style={{ marginBottom: 28 }}>
        <OnboardingToggleField
          label="Auto-republish when restocked"
          name="autoRepublishEnabled"
          defaultChecked={existingSettings.autoRepublishEnabled}
          helpText="Products are automatically republished when inventory is added back."
        />
      </div>

      <OnboardingPrimaryButton loading={submitting}>Finish setup →</OnboardingPrimaryButton>
    </fetcher.Form>
  );
}
