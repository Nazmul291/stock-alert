import type { CSSProperties, ReactNode } from "react";
import { fieldLabel, inputStyle, helpText } from "../IntegrationControls";

// Three side-by-side cards, per the promo design. Selection styling follows
// MonitoringScopeSection's radio-card pattern (whole card is the <label>,
// native radio hidden, custom circle drawn) — but each mode carries its own
// accent color rather than the shared indigo, since the modes are peers
// rather than a list of variations on one thing.
type Mode = {
  value: string;
  title: string;
  desc: string;
  bullets: string[];
  color: string;
  tint: string;
  icon: ReactNode;
};

const MODES: Mode[] = [
  {
    value: "smart",
    title: "Smart Mode",
    desc: "Forecasting based on real sales data, lead time, and safety stock.",
    bullets: ["Sales Velocity", "Lead Time", "Safety Stock"],
    color: "#6d4aff",
    tint: "#efeaff",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 21 9-9" /><path d="M15 4 13.5 7.5 10 9l3.5 1.5L15 14l1.5-3.5L20 9l-3.5-1.5z" />
      </svg>
    ),
  },
  {
    value: "classic",
    title: "Classic Mode",
    desc: "Set your own minimum stock level and reorder when you drop below it.",
    bullets: ["Minimum Stock Level", "No sales history needed"],
    color: "#27ae72",
    tint: "#e2f5ea",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="8" cy="18" r="2" fill="currentColor" />
      </svg>
    ),
  },
  {
    value: "custom",
    title: "Custom Mode",
    desc: "Create custom rules for specific products, collections, vendors, or seasons.",
    bullets: ["Advanced Rules", "Custom Conditions"],
    color: "#e79420",
    tint: "#fdeed6",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
];

const cardBase: CSSProperties = {
  flex: "1 1 200px", display: "flex", flexDirection: "column", gap: 10,
  padding: "16px 16px 18px", borderRadius: 12, cursor: "pointer",
  transition: "border-color 0.15s, background 0.15s",
};

export function ForecastModeSection({
  forecastMode, safetyStockDays, minStockLevel, lowStockThreshold, canUseCustomRules,
  onForecastModeChange, onSafetyStockDaysChange, onMinStockLevelChange,
}: {
  forecastMode: string;
  safetyStockDays: number;
  minStockLevel: number | null;
  lowStockThreshold: number;
  canUseCustomRules: boolean;
  onForecastModeChange: (v: string) => void;
  onSafetyStockDaysChange: (v: number) => void;
  onMinStockLevelChange: (v: number | null) => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Forecast Mode">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Choose how you want to forecast your inventory. This controls reorder suggestions on the Reorder Planner
          and product pages — your low-stock alerts keep working the same way in every mode.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          {MODES.map((m) => {
            const selected = forecastMode === m.value;
            const locked = m.value === "custom" && !canUseCustomRules;
            return (
              <label
                key={m.value}
                style={{
                  ...cardBase,
                  border: `1.5px solid ${selected ? m.color : "#e5e7eb"}`,
                  background: selected ? m.tint : "#fff",
                  opacity: locked ? 0.55 : 1,
                  cursor: locked ? "not-allowed" : "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 11, background: m.tint, color: m.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {m.icon}
                  </div>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                    border: `2px solid ${selected ? m.color : "#d1d5db"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {selected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />}
                  </div>
                </div>

                <input
                  type="radio"
                  name="_forecastModeRadio"
                  value={m.value}
                  checked={selected}
                  disabled={locked}
                  onChange={() => onForecastModeChange(m.value)}
                  style={{ display: "none" }}
                />

                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: selected ? m.color : "#111827" }}>{m.title}</div>
                  <div style={{ fontSize: 12.5, color: "#6b7280", marginTop: 3, lineHeight: 1.5 }}>{m.desc}</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
                  {m.bullets.map((b) => (
                    <span key={b} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#3f3e52" }}>
                      <span style={{ color: m.color, fontWeight: 700 }}>✓</span>{b}
                    </span>
                  ))}
                </div>

                {locked && (
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>
                    Requires the Enterprise plan.
                  </span>
                )}
              </label>
            );
          })}
        </div>

        {/* Per-mode configuration, same conditional-subfield approach as
            MonitoringScopeSection. */}
        {forecastMode === "smart" && (
          <div style={{ maxWidth: 320 }}>
            <label htmlFor="safetyStockDaysInput" style={fieldLabel}>Safety stock (days of cover)</label>
            <input
              id="safetyStockDaysInput"
              type="number" min={0} max={90}
              value={safetyStockDays}
              onChange={(e) => onSafetyStockDaysChange(Math.max(0, Math.min(90, parseInt(e.target.value) || 0)))}
              style={{ ...inputStyle(), width: 110 }}
            />
            <p style={helpText}>
              Extra days of stock held beyond your supplier lead time. Reorder point becomes
              (lead time + safety stock) × daily sales. 0 keeps today&apos;s behavior.
            </p>
          </div>
        )}

        {forecastMode === "classic" && (
          <div style={{ maxWidth: 320 }}>
            <label htmlFor="minStockLevelInput" style={fieldLabel}>Minimum stock level</label>
            <input
              id="minStockLevelInput"
              type="number" min={0} max={100000}
              // Empty string (not 0) when unset — 0 is a meaningful level a
              // merchant might genuinely want, so it can't double as "unset".
              value={minStockLevel ?? ""}
              placeholder={String(lowStockThreshold)}
              onChange={(e) => {
                const raw = e.target.value.trim();
                onMinStockLevelChange(raw === "" ? null : Math.max(0, Math.min(100000, parseInt(raw) || 0)));
              }}
              style={{ ...inputStyle(), width: 110 }}
            />
            <p style={helpText}>
              Reorder whenever a variant falls to or below this. Leave blank to use your low-stock
              threshold ({lowStockThreshold}). Works with no sales history, so newly-added and
              already-sold-out products still get suggestions.
            </p>
          </div>
        )}

        {forecastMode === "custom" && (
          <div style={{ padding: "12px 16px", background: "#fffaf2", border: "1px solid #f6e6cd", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
            Custom rules are managed on the <s-link href="/app/forecast-rules">Forecast Rules</s-link> page.
            Products with no matching rule fall back to Smart Mode.
          </div>
        )}
      </s-section>
    </div>
  );
}
