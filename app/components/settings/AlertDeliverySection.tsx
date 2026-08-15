import { Toggle, fieldLabel, helpText } from "../IntegrationControls";
import { DIGEST_TIMEZONES, HOUR_OPTIONS, formatHourLabel } from "../../lib/timezones";

export function AlertDeliverySection({
  alertDeliveryMode,
  alertBatchHour,
  digestTimezone,
  lowStockMuted,
  outOfStockMuted,
  restockMuted,
  onAlertDeliveryModeChange,
  onAlertBatchHourChange,
  onLowStockMutedChange,
  onOutOfStockMutedChange,
  onRestockMutedChange,
}: {
  alertDeliveryMode: string;
  alertBatchHour: number;
  // Read-only here — the timezone picker itself lives on DigestEmailsSection
  // (one shared notification timezone, not a second field to keep in sync).
  digestTimezone: string;
  lowStockMuted: boolean;
  outOfStockMuted: boolean;
  restockMuted: boolean;
  onAlertDeliveryModeChange: (v: string) => void;
  onAlertBatchHourChange: (v: number) => void;
  onLowStockMutedChange: (v: boolean) => void;
  onOutOfStockMutedChange: (v: boolean) => void;
  onRestockMutedChange: (v: boolean) => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Alert Delivery">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Controls <strong>Email and Slack only</strong> for low-stock, out-of-stock, and back-in-stock alerts.
          In-app alert history, WhatsApp, Klaviyo, Asana, and Shopify Flow are unaffected and always send immediately.
        </p>

        <p style={fieldLabel}>Delivery</p>
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          {(["instant", "daily"] as const).map((mode) => (
            <label
              key={mode}
              style={{
                display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                padding: "10px 18px", borderRadius: 8,
                border: `1.5px solid ${alertDeliveryMode === mode ? "#4f46e5" : "#e5e7eb"}`,
                background: alertDeliveryMode === mode ? "#eef2ff" : "#fff",
                fontSize: 14, fontWeight: 500, color: alertDeliveryMode === mode ? "#4338ca" : "#374151",
              }}
            >
              <input
                type="radio"
                name="alertDeliveryMode"
                value={mode}
                checked={alertDeliveryMode === mode}
                onChange={() => onAlertDeliveryModeChange(mode)}
                style={{ display: "none" }}
              />
              {mode === "instant" ? "Every event" : "Once per day"}
            </label>
          ))}
        </div>
        <p style={helpText}>
          {alertDeliveryMode === "daily"
            ? "One combined summary — a single table of low-stock, out-of-stock, and back-in-stock events — is sent once a day instead of a separate email/Slack message per event."
            : "An email/Slack message is sent the moment each alert fires (today's behavior)."}
        </p>

        {alertDeliveryMode === "daily" && (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="alertBatchHour" style={fieldLabel}>Sent at</label>
            <select
              id="alertBatchHour"
              name="alertBatchHour"
              value={alertBatchHour}
              onChange={(e) => onAlertBatchHourChange(parseInt(e.target.value, 10))}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#374151", width: "fit-content", minWidth: 140 }}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{formatHourLabel(h)}</option>
              ))}
            </select>
            <p style={helpText}>
              In {DIGEST_TIMEZONES.find((tz) => tz.value === digestTimezone)?.label ?? digestTimezone} — same time zone as the digest, set below.
            </p>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <p style={fieldLabel}>Choose which alerts to receive</p>
          <Toggle
            label="Low stock alerts"
            description="Send Email and Slack alerts when stock runs low."
            checked={!lowStockMuted}
            onChange={(v) => onLowStockMutedChange(!v)}
          />
          <Toggle
            label="Out of stock alerts"
            description="Send Email and Slack alerts when a product sells out."
            checked={!outOfStockMuted}
            onChange={(v) => onOutOfStockMutedChange(!v)}
          />
          <Toggle
            label="Back in stock alerts"
            description="Send Email and Slack alerts when a product is back in stock."
            checked={!restockMuted}
            onChange={(v) => onRestockMutedChange(!v)}
          />
        </div>
      </s-section>
    </div>
  );
}
