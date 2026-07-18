import { fieldLabel, inputStyle, helpText } from "../IntegrationControls";

const THRESHOLD_OPTIONS = [30, 60, 90] as const;

export function EnterpriseReportingSection({
  limitedEditionTag, deadStockThresholdDays, canCoreLimitedEdition, canDeadStockAlerts,
  onLimitedEditionTagChange, onDeadStockThresholdDaysChange,
}: {
  limitedEditionTag: string;
  deadStockThresholdDays: number;
  canCoreLimitedEdition: boolean;
  canDeadStockAlerts: boolean;
  onLimitedEditionTagChange: (v: string) => void;
  onDeadStockThresholdDaysChange: (v: number) => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Enterprise Reporting">
        <div style={{ opacity: canCoreLimitedEdition ? 1 : 0.45, pointerEvents: canCoreLimitedEdition ? "auto" : "none", marginBottom: 20 }}>
          <label htmlFor="limitedEditionTagInput" style={fieldLabel}>Limited-edition tag</label>
          <input
            id="limitedEditionTagInput"
            type="text"
            name="limitedEditionTag"
            value={limitedEditionTag}
            onChange={(e) => onLimitedEditionTagChange(e.target.value)}
            placeholder="limited-edition"
            disabled={!canCoreLimitedEdition}
            style={{ ...inputStyle(), maxWidth: 280 }}
          />
          <p style={helpText}>
            Products with this tag are reported as &quot;Limited-Edition&quot; in Analytics; everything else as &quot;Core&quot;.
          </p>
          {!canCoreLimitedEdition && (
            <p style={{ fontSize: 13, margin: "4px 0 0" }}>
              <span style={{ color: "#9ca3af" }}>Requires Enterprise plan.</span> <s-link href="/app/billing">Upgrade →</s-link>
            </p>
          )}
        </div>

        <div style={{ opacity: canDeadStockAlerts ? 1 : 0.45, pointerEvents: canDeadStockAlerts ? "auto" : "none" }}>
          {/* Describes the pill group below, not a single control — a plain
              span, not <label>, since there's no one input to associate it with. */}
          <span style={{ ...fieldLabel, display: "block" }}>Dead stock threshold</span>
          <input type="hidden" name="deadStockThresholdDays" value={deadStockThresholdDays} />
          <div style={{ display: "flex", gap: 10 }}>
            {THRESHOLD_OPTIONS.map((days) => (
              <label
                key={days}
                style={{
                  display: "flex", alignItems: "center", gap: 8, cursor: canDeadStockAlerts ? "pointer" : "not-allowed",
                  padding: "10px 18px", borderRadius: 8,
                  border: `1.5px solid ${deadStockThresholdDays === days ? "#4f46e5" : "#e5e7eb"}`,
                  background: deadStockThresholdDays === days ? "#eef2ff" : "#fff",
                  fontSize: 14, fontWeight: 500, color: deadStockThresholdDays === days ? "#4338ca" : "#374151",
                }}
              >
                <input
                  type="radio"
                  name="deadStockThresholdDaysRadio"
                  value={days}
                  checked={deadStockThresholdDays === days}
                  onChange={() => onDeadStockThresholdDaysChange(days)}
                  disabled={!canDeadStockAlerts}
                  style={{ display: "none" }}
                />
                {days} days
              </label>
            ))}
          </div>
          <p style={helpText}>Products in stock with no sales for at least this many days show up as dead stock in Analytics.</p>
          {!canDeadStockAlerts && (
            <p style={{ fontSize: 13, margin: "4px 0 0" }}>
              <span style={{ color: "#9ca3af" }}>Requires Enterprise plan.</span> <s-link href="/app/billing">Upgrade →</s-link>
            </p>
          )}
        </div>
      </s-section>
    </div>
  );
}
