import { Toggle, fieldLabel, helpText } from "../IntegrationControls";
import { DIGEST_TIMEZONES, HOUR_OPTIONS, WEEKDAY_OPTIONS, formatHourLabel } from "../../lib/timezones";

export function DigestEmailsSection({
  digestEnabled, digestFrequency, digestTimezone, digestHour, digestDayOfWeek, canDailyDigest,
  onDigestEnabledChange, onDigestFrequencyChange, onDigestTimezoneChange, onDigestHourChange, onDigestDayOfWeekChange,
}: {
  digestEnabled: boolean;
  digestFrequency: string;
  digestTimezone: string;
  digestHour: number;
  digestDayOfWeek: number;
  canDailyDigest: boolean;
  onDigestEnabledChange: (v: boolean) => void;
  onDigestFrequencyChange: (v: string) => void;
  onDigestTimezoneChange: (v: string) => void;
  onDigestHourChange: (v: number) => void;
  onDigestDayOfWeekChange: (v: number) => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Digest Emails">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          A periodic summary of at-risk and out-of-stock products sent to your notification email —
          set that (and Slack, WhatsApp, Klaviyo, Shopify Flow) on{" "}
          <s-link href="/app/integrations">Integrations</s-link>.{" "}
          {canDailyDigest ? "Pro plan: choose daily or weekly, and the day/time." : "Basic plan: weekly, choose the day/time."}
        </p>

        <Toggle
          label="Enable digest emails"
          description="Only sent when at-risk products exist — no empty reports."
          checked={digestEnabled}
          onChange={onDigestEnabledChange}
        />

        {digestEnabled && (
          <div style={{ marginTop: 16, marginLeft: 0 }}>
            <label style={fieldLabel}>Frequency</label>
            {canDailyDigest ? (
              <div style={{ display: "flex", gap: 10 }}>
                {(["daily", "weekly"] as const).map((freq) => (
                  <label
                    key={freq}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                      padding: "10px 18px", borderRadius: 8,
                      border: `1.5px solid ${digestFrequency === freq ? "#4f46e5" : "#e5e7eb"}`,
                      background: digestFrequency === freq ? "#eef2ff" : "#fff",
                      fontSize: 14, fontWeight: 500, color: digestFrequency === freq ? "#4338ca" : "#374151",
                    }}
                  >
                    <input
                      type="radio"
                      name="digestFrequency"
                      value={freq}
                      checked={digestFrequency === freq}
                      onChange={() => onDigestFrequencyChange(freq)}
                      style={{ display: "none" }}
                    />
                    {freq === "daily" ? "Daily" : "Weekly"}
                  </label>
                ))}
              </div>
            ) : (
              <>
                <input type="hidden" name="digestFrequency" value="weekly" />
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 8, border: "1.5px solid #e5e7eb", background: "#f9fafb", width: "fit-content" }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>Weekly</span>
                  <span style={{ fontSize: 11, color: "#9ca3af" }}>Upgrade to Pro for daily</span>
                </div>
              </>
            )}

            {digestFrequency === "weekly" && (
              <>
                <label style={{ ...fieldLabel, marginTop: 16 }}>Day of week</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {WEEKDAY_OPTIONS.map((w) => (
                    <label
                      key={w.value}
                      style={{
                        display: "flex", alignItems: "center", cursor: "pointer",
                        padding: "8px 12px", borderRadius: 8,
                        border: `1.5px solid ${digestDayOfWeek === w.value ? "#4f46e5" : "#e5e7eb"}`,
                        background: digestDayOfWeek === w.value ? "#eef2ff" : "#fff",
                        fontSize: 13, fontWeight: 500, color: digestDayOfWeek === w.value ? "#4338ca" : "#374151",
                      }}
                    >
                      <input
                        type="radio"
                        name="digestDayOfWeek"
                        value={w.value}
                        checked={digestDayOfWeek === w.value}
                        onChange={() => onDigestDayOfWeekChange(w.value)}
                        style={{ display: "none" }}
                      />
                      {w.short}
                    </label>
                  ))}
                </div>
              </>
            )}

            <label htmlFor="digestTimezone" style={{ ...fieldLabel, marginTop: 16 }}>Time zone</label>
            <select
              id="digestTimezone"
              name="digestTimezone"
              value={digestTimezone}
              onChange={(e) => onDigestTimezoneChange(e.target.value)}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#374151", width: "fit-content", minWidth: 220 }}
            >
              {DIGEST_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>

            <label htmlFor="digestHour" style={{ ...fieldLabel, marginTop: 16 }}>Time</label>
            <select
              id="digestHour"
              name="digestHour"
              value={digestHour}
              onChange={(e) => onDigestHourChange(parseInt(e.target.value, 10))}
              style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#374151", width: "fit-content", minWidth: 140 }}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>{formatHourLabel(h)}</option>
              ))}
            </select>
            <p style={helpText}>
              Digest is sent at {formatHourLabel(digestHour)}
              {digestFrequency === "weekly" ? ` every ${WEEKDAY_OPTIONS[digestDayOfWeek].label}` : ""}
              {" "}in {DIGEST_TIMEZONES.find((tz) => tz.value === digestTimezone)?.label ?? digestTimezone}.
            </p>
          </div>
        )}
      </s-section>
    </div>
  );
}
