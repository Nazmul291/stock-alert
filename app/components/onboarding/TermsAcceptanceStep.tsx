import { useState } from "react";
import { useFetcher } from "react-router";
import { OnboardingPrimaryButton } from "./OnboardingPrimaryButton";

// Uses a fetcher instead of <Form> so accepting terms is a silent background
// update — a plain <Form> on this index route would need `?index` appended
// to the URL to disambiguate its action from the parent layout route's,
// which briefly (and confusingly) shows up in the address bar.
export function TermsAcceptanceStep({ onSubmit }: { onSubmit?: () => void }) {
  const [agreed, setAgreed] = useState(false);
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="accept_terms" />

      <p style={{ margin: "0 0 20px", fontSize: 14, color: "#374151", lineHeight: 1.5 }}>
        Before we set up your inventory alerts, please review and accept our Terms of Service and Privacy Policy.
      </p>

      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 24, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
        />
        <span style={{ fontSize: 14, color: "#111827" }}>
          I have read and agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#008060", fontWeight: 600 }}>Terms of Service</a>
          {" "}and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#008060", fontWeight: 600 }}>Privacy Policy</a>.
        </span>
      </label>

      <OnboardingPrimaryButton loading={submitting} disabled={!agreed}>Accept &amp; continue →</OnboardingPrimaryButton>
    </fetcher.Form>
  );
}
