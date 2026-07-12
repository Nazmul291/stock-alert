import { fieldLabel, inputStyle, helpText } from "./IntegrationControls";
import { LogoUrlField } from "./LogoUrlField";

export function EmailBrandingSection({
  brandSenderName, brandColor, brandLogoUrl, canWhiteLabelEmails,
  onBrandSenderNameChange, onBrandColorChange, onBrandLogoUrlChange,
}: {
  brandSenderName: string;
  brandColor: string;
  brandLogoUrl: string;
  canWhiteLabelEmails: boolean;
  onBrandSenderNameChange: (v: string) => void;
  onBrandColorChange: (v: string) => void;
  onBrandLogoUrlChange: (v: string) => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Email Branding">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Customize how outgoing alert emails look. Applied to all notifications.{" "}
          {!canWhiteLabelEmails && <><span style={{ color: "#9ca3af" }}>Requires Professional plan.</span> <s-link href="/app/billing">Upgrade →</s-link></>}
        </p>

        <div style={{ opacity: canWhiteLabelEmails ? 1 : 0.45, pointerEvents: canWhiteLabelEmails ? "auto" : "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={fieldLabel}>Sender name</label>
              <input
                type="text"
                name="brandSenderName"
                value={brandSenderName}
                onChange={(e) => onBrandSenderNameChange(e.target.value)}
                placeholder="Stock Alert"
                disabled={!canWhiteLabelEmails}
                style={inputStyle()}
              />
              <p style={helpText}>Shown as "From" name in email clients.</p>
            </div>
            <div>
              <label style={fieldLabel}>Brand color</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="color"
                  value={brandColor || "#4f46e5"}
                  onChange={(e) => onBrandColorChange(e.target.value)}
                  disabled={!canWhiteLabelEmails}
                  style={{ width: 40, height: 38, border: "1.5px solid #d1d5db", borderRadius: 8, cursor: canWhiteLabelEmails ? "pointer" : "not-allowed", padding: 2, flexShrink: 0 }}
                />
                <input
                  type="text"
                  name="brandColor"
                  value={brandColor || "#4f46e5"}
                  onChange={(e) => onBrandColorChange(e.target.value)}
                  placeholder="#4f46e5"
                  disabled={!canWhiteLabelEmails}
                  style={{ ...inputStyle(), width: 110, fontFamily: "monospace" }}
                />
                <div style={{ width: 38, height: 38, borderRadius: 8, background: brandColor || "#4f46e5", border: "1px solid #e5e7eb", flexShrink: 0 }} />
              </div>
              <p style={helpText}>Used for email header and CTA button color.</p>
            </div>
          </div>

          <LogoUrlField
            value={brandLogoUrl}
            brandColor={brandColor}
            disabled={!canWhiteLabelEmails}
            onChange={onBrandLogoUrlChange}
          />
        </div>
      </s-section>
    </div>
  );
}
