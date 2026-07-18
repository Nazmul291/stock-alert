import { useState } from "react";
import { Form } from "react-router";
import { OnboardingPrimaryButton } from "./OnboardingPrimaryButton";

export function TermsAcceptanceStep({ submitting, onSubmit }: { submitting: boolean; onSubmit?: () => void }) {
  const [agreed, setAgreed] = useState(false);

  return (
    <Form method="post" onSubmit={onSubmit}>
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
    </Form>
  );
}
