import { useState, useEffect } from "react";
import { useFetcher } from "react-router";
import { ConnectRow, ConnectModal, fieldLabel, inputStyle, helpText } from "../IntegrationControls";
import { useIntegrationsStore } from "../../stores/integrations-store";

// WhatsApp — one number Stock Alert owns sends to whatever personal phone the
// merchant enters, so "connecting" is just proving they own that number: send
// a code, they type it back. No Meta login involved at all.
export function WhatsAppIntegrationSection() {
  const phone = useIntegrationsStore((s) => s.data!.settings.whatsappPhone);
  const phoneVerified = useIntegrationsStore((s) => s.data!.settings.whatsappPhoneVerified);
  const retry = useIntegrationsStore((s) => s.retry)!;

  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [whatsappStep, setWhatsappStep] = useState<"phone" | "code">("phone");
  const [whatsappPhoneInput, setWhatsappPhoneInput] = useState(phone);
  const [whatsappCodeInput, setWhatsappCodeInput] = useState("");
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const whatsappSendFetcher = useFetcher<{ intent: string; success: boolean; error?: string }>();
  const whatsappSending = whatsappSendFetcher.state !== "idle";
  const whatsappVerifyFetcher = useFetcher<{ intent: string; success: boolean; error?: string }>();
  const whatsappVerifying = whatsappVerifyFetcher.state !== "idle";
  const whatsappDisconnectFetcher = useFetcher<{ intent: string; success: boolean }>();
  const whatsappDisconnecting = whatsappDisconnectFetcher.state !== "idle";

  useEffect(() => {
    const d = whatsappSendFetcher.data;
    if (d?.intent === "send_whatsapp_code") {
      if (d.success) {
        setWhatsappStep("code");
        setWhatsappError(null);
      } else {
        setWhatsappError(d.error ?? "Something went wrong.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsappSendFetcher.data]);

  useEffect(() => {
    const d = whatsappVerifyFetcher.data;
    if (d?.intent === "verify_whatsapp_code") {
      if (d.success) {
        setWhatsappModalOpen(false);
        setWhatsappError(null);
        setWhatsappStep("phone");
        setWhatsappCodeInput("");
        retry();
      } else {
        setWhatsappError(d.error ?? "Incorrect or expired code.");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsappVerifyFetcher.data]);

  useEffect(() => {
    const d = whatsappDisconnectFetcher.data;
    if (d?.intent === "disconnect_whatsapp" && d?.success) retry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsappDisconnectFetcher.data]);

  return (
    <>
      <ConnectRow
        icon={
          <img
            src="https://static.whatsapp.net/rsrc.php/y1/r/FJbTMJqMap7.svg"
            alt=""
            width={20}
            height={20}
            loading="lazy"
            style={{ display: "block" }}
          />
        }
        title="WhatsApp"
        connected={phoneVerified}
        locked
        lockedNode={<span style={{ color: "#9ca3af", fontSize: 13 }}>Coming Soon</span>}
        hideEdit
        onConnect={() => {
          setWhatsappPhoneInput(phone);
          setWhatsappCodeInput("");
          setWhatsappStep("phone");
          setWhatsappError(null);
          setWhatsappModalOpen(true);
        }}
        onDisconnect={() => {
          if (confirm("Disconnect WhatsApp? Alerts will stop sending until you reconnect.")) {
            whatsappDisconnectFetcher.submit({ intent: "disconnect_whatsapp" }, { method: "post" });
          }
        }}
        disconnecting={whatsappDisconnecting}
        connectedLabel={
          <>Connected to <strong>{phone}</strong>.</>
        }
      />

      {whatsappModalOpen && (
        <ConnectModal
          title="WhatsApp"
          icon={
            <img
              src="https://static.whatsapp.net/rsrc.php/y1/r/FJbTMJqMap7.svg"
              alt=""
              width={20}
              height={20}
              loading="lazy"
              style={{ display: "block" }}
            />
          }
          onClose={() => setWhatsappModalOpen(false)}
          onSubmit={() => {
            if (whatsappStep === "phone") {
              whatsappSendFetcher.submit({ intent: "send_whatsapp_code", phone: whatsappPhoneInput }, { method: "post" });
            } else {
              whatsappVerifyFetcher.submit({ intent: "verify_whatsapp_code", code: whatsappCodeInput }, { method: "post" });
            }
          }}
          submitting={whatsappStep === "phone" ? whatsappSending : whatsappVerifying}
          submitLabel={whatsappStep === "phone" ? "Send code" : "Verify"}
          error={whatsappError}
        >
          {whatsappStep === "phone" ? (
            <>
              <label style={fieldLabel}>WhatsApp number</label>
              <input
                type="text"
                value={whatsappPhoneInput}
                onChange={(e) => setWhatsappPhoneInput(e.target.value)}
                placeholder="14155552671"
                style={inputStyle(!!whatsappError)}
                autoFocus
              />
              <p style={helpText}>Include country code, no +. We&apos;ll text you a verification code on WhatsApp.</p>
            </>
          ) : (
            <>
              <label style={fieldLabel}>Verification code</label>
              <input
                type="text"
                value={whatsappCodeInput}
                onChange={(e) => setWhatsappCodeInput(e.target.value)}
                placeholder="123456"
                style={inputStyle(!!whatsappError)}
                autoFocus
              />
              <p style={helpText}>Sent to {whatsappPhoneInput} via WhatsApp. Expires in 10 minutes.</p>
            </>
          )}
        </ConnectModal>
      )}
    </>
  );
}
