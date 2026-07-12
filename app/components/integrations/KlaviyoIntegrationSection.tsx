import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { ConnectRow, ConnectModal, fieldLabel, inputStyle, helpText } from "../IntegrationControls";
import { useIntegrationsStore } from "../../stores/integrations-store";
import { canUseFeature } from "../../lib/plan-limits";

// Klaviyo — connect/disconnect via modal. The API key is write-only (never
// sent to the client), so the input always starts blank.
export function KlaviyoIntegrationSection() {
  const canKlaviyo = canUseFeature(useIntegrationsStore((s) => s.data!.plan), "klaviyoIntegration");
  const enabled = useIntegrationsStore((s) => s.data!.settings.klaviyoEnabled);
  const retry = useIntegrationsStore((s) => s.retry)!;

  const [klaviyoModalOpen, setKlaviyoModalOpen] = useState(false);
  const [klaviyoInput, setKlaviyoInput] = useState("");
  const [klaviyoError, setKlaviyoError] = useState<string | null>(null);
  const klaviyoFetcher = useFetcher<{ intent: string; success: boolean; error?: string }>();
  const klaviyoSaving = klaviyoFetcher.state !== "idle";
  const klaviyoDisconnectFetcher = useFetcher<{ intent: string; success: boolean }>();
  const klaviyoDisconnecting = klaviyoDisconnectFetcher.state !== "idle";

  useEffect(() => {
    const d = klaviyoFetcher.data;
    if (d?.intent === "save_klaviyo") {
      if (d.success) {
        setKlaviyoModalOpen(false);
        setKlaviyoError(null);
        retry();
      } else {
        setKlaviyoError(d.error ?? "Something went wrong.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaviyoFetcher.data]);

  useEffect(() => {
    const d = klaviyoDisconnectFetcher.data;
    if (d?.intent === "disconnect_klaviyo" && d?.success) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klaviyoDisconnectFetcher.data]);

  return (
    <>
      <ConnectRow
        icon={
          <img
            src="https://www.klaviyo.com/icons/icon-32x32.png"
            alt=""
            width={20}
            height={20}
            loading="lazy"
            style={{ display: "block" }}
          />
        }
        title="Klaviyo"
        badge={!canKlaviyo ? "Pro" : null}
        connected={canKlaviyo && enabled}
        locked={!canKlaviyo}
        lockedNode={<s-link href="/app/billing">Upgrade to Pro →</s-link>}
        connectLabel="Connect"
        onConnect={() => { setKlaviyoInput(""); setKlaviyoError(null); setKlaviyoModalOpen(true); }}
        onDisconnect={() => klaviyoDisconnectFetcher.submit({ intent: "disconnect_klaviyo" }, { method: "post" })}
        disconnecting={klaviyoDisconnecting}
        connectedLabel="Sending inventory events to your Klaviyo account."
      />

      {klaviyoModalOpen && (
        <ConnectModal
          title="Klaviyo"
          icon={
            <img
              src="https://www.klaviyo.com/icons/icon-32x32.png"
              alt=""
              width={20}
              height={20}
              loading="lazy"
              style={{ display: "block" }}
            />
          }
          onClose={() => setKlaviyoModalOpen(false)}
          onSubmit={() => klaviyoFetcher.submit({ intent: "save_klaviyo", klaviyoApiKey: klaviyoInput }, { method: "post" })}
          submitting={klaviyoSaving}
          submitLabel="Connect"
          error={klaviyoError}
        >
          <label style={fieldLabel}>Private API key</label>
          <input
            type="password"
            value={klaviyoInput}
            onChange={(e) => setKlaviyoInput(e.target.value)}
            placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            style={inputStyle(!!klaviyoError)}
            autoFocus
          />
          <p style={helpText}>
            Create one in Klaviyo under <strong>Settings → API Keys → Create Private API Key</strong>. Needs
            write access to Events and Profiles.
          </p>
        </ConnectModal>
      )}
    </>
  );
}
