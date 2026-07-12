import { fieldLabel, inputStyle, helpText } from "../IntegrationControls";
import { useIntegrationsStore } from "../../stores/integrations-store";
import { canUseFeature } from "../../lib/plan-limits";

export function OutboundWebhookSection({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const loading = useIntegrationsStore((s) => s.data === null);
  const canUse = canUseFeature(useIntegrationsStore((s) => s.data?.plan) ?? "basic", "outboundWebhook");
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Outbound Webhook">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Fire a JSON POST to any URL on every stock event. Connect Zapier, Make, or your own ERP.{" "}
          {!loading && !canUse && (
            <>
              <span style={{ color: "#9ca3af" }}>Requires Professional plan.</span>{" "}
              <s-link href="/app/billing">Upgrade →</s-link>
            </>
          )}
        </p>

        <div style={{ opacity: canUse ? 1 : 0.45, pointerEvents: canUse ? "auto" : "none" }}>
          <label style={fieldLabel}>Webhook URL</label>
          <input
            type="url"
            name="outboundWebhookUrl"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://hooks.zapier.com/hooks/catch/..."
            disabled={!canUse}
            style={inputStyle()}
          />
          <p style={helpText}>Stock Alert will POST a JSON payload to this URL whenever an alert is triggered.</p>

          {canUse && value && (
            <div style={{ marginTop: 12, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "#374151", margin: "0 0 6px" }}>Example payload</p>
              <pre style={{ fontSize: 11, color: "#4b5563", margin: 0, overflow: "auto" }}>{JSON.stringify({
                event: "low_stock",
                shop: "your-store.myshopify.com",
                productId: "1234567890",
                productTitle: "Blue T-Shirt",
                sku: "BTS-001",
                currentQuantity: 3,
                threshold: 5,
                timestamp: new Date().toISOString(),
              }, null, 2)}</pre>
            </div>
          )}
        </div>
      </s-section>
    </div>
  );
}
