import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { ConnectRow, ConnectModal, fieldLabel, inputStyle, helpText } from "../IntegrationControls";
import { useIntegrationsStore } from "../../stores/integrations-store";
import { canUseFeature } from "../../lib/plan-limits";

// Email — connect/disconnect via modal, no inline toggle.
export function EmailIntegrationSection() {
  const loading = useIntegrationsStore((s) => s.data === null);
  const notificationEmail = useIntegrationsStore((s) => s.data?.settings.notificationEmail) ?? "";
  const emailNotifications = useIntegrationsStore((s) => s.data?.settings.emailNotifications) ?? false;
  const storeEmail = useIntegrationsStore((s) => s.data?.storeEmail) ?? null;
  const plan = useIntegrationsStore((s) => s.data?.plan) ?? "basic";
  const canMultipleRecipients = canUseFeature(plan, "multipleRecipients");
  const retry = useIntegrationsStore((s) => s.retry);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState(notificationEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const emailFetcher = useFetcher<{ intent: string; success: boolean; error?: string }>();
  const emailSaving = emailFetcher.state !== "idle";
  const emailDisableFetcher = useFetcher<{ intent: string; success: boolean }>();
  const emailDisabling = emailDisableFetcher.state !== "idle";

  useEffect(() => {
    const d = emailFetcher.data;
    if (d?.intent === "save_email") {
      if (d.success) {
        setEmailModalOpen(false);
        setEmailError(null);
        retry?.();
      } else {
        setEmailError(d.error ?? "Something went wrong.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailFetcher.data]);

  useEffect(() => {
    const d = emailDisableFetcher.data;
    if (d?.intent === "disable_email" && d?.success) retry?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailDisableFetcher.data]);

  return (
    <>
      <ConnectRow
        icon={<span style={{ fontSize: 20 }}>✉️</span>}
        title="Email"
        connected={!loading && emailNotifications}
        connectLabel="Connect"
        onConnect={() => { setEmailInput(notificationEmail); setEmailError(null); setEmailModalOpen(true); }}
        onDisconnect={() => emailDisableFetcher.submit({ intent: "disable_email" }, { method: "post" })}
        disconnecting={emailDisabling}
        connectedLabel={
          <>Sending to <strong>{notificationEmail || storeEmail || "the store owner email"}</strong>.</>
        }
      />

      {emailModalOpen && (
        <ConnectModal
          title="Email"
          icon={<span style={{ fontSize: 20 }}>✉️</span>}
          onClose={() => setEmailModalOpen(false)}
          onSubmit={() => emailFetcher.submit({ intent: "save_email", notificationEmail: emailInput }, { method: "post" })}
          submitting={emailSaving}
          submitLabel={emailNotifications ? "Save" : "Connect"}
          error={emailError}
        >
          <label style={fieldLabel}>
            Notification email{canMultipleRecipients ? " — multiple allowed" : ""}
          </label>
          <input
            type="text"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder={canMultipleRecipients ? "alerts@example.com, team@example.com" : "alerts@example.com"}
            style={inputStyle(!!emailError)}
            autoFocus
          />
          <p style={helpText}>
            {canMultipleRecipients
              ? "Separate multiple addresses with commas."
              : storeEmail
              ? `Leave empty to use store email (${storeEmail}).`
              : "Leave empty to use the store owner email."}
          </p>
        </ConnectModal>
      )}
    </>
  );
}
