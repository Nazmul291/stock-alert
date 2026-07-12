import { useState, useEffect } from "react";
import { fieldLabel, inputStyle, helpText } from "../IntegrationControls";
import { ShopifyFilePicker } from "./ShopifyFilePicker";

/* ── Logo URL field with Shopify file picker + live email preview ── */
export function LogoUrlField({
  value, brandColor, disabled, onChange,
}: {
  value: string;
  brandColor: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [imgStatus, setImgStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [debouncedUrl, setDebouncedUrl] = useState(value);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!value) { setImgStatus("idle"); setDebouncedUrl(""); return; }
    setImgStatus("loading");
    const t = setTimeout(() => setDebouncedUrl(value), 500);
    return () => clearTimeout(t);
  }, [value]);

  const isValidUrl = (u: string) => { try { return Boolean(new URL(u)); } catch { return false; } };
  const showPreview = value && isValidUrl(value);
  const color = brandColor || "#4f46e5";

  return (
    <div>
      <label style={fieldLabel}>Logo URL</label>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="url"
            name="brandLogoUrl"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://yourstore.com/logo.png"
            disabled={disabled}
            style={{ ...inputStyle(), paddingRight: value ? 36 : 12 }}
          />
          {value && !disabled && (
            <button
              type="button"
              onClick={() => onChange("")}
              aria-label="Clear logo URL"
              style={{
                position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                background: "#f3f4f6", border: "none", borderRadius: "50%",
                width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#6b7280", fontSize: 14, lineHeight: 1,
              }}
            >×</button>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            style={{
              padding: "9px 14px", borderRadius: 8, border: "1.5px solid #d1d5db",
              background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600,
              cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            Browse Files
          </button>
        )}
      </div>

      <p style={helpText}>PNG, JPG, SVG or WebP only — max 400px wide. Shown at the top of every alert email.</p>

      {showPreview ? (
        <div style={{ marginTop: 16, maxWidth: 480 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email preview</span>
            {imgStatus === "ok" && <span style={{ fontSize: 11, fontWeight: 600, color: "#059669" }}>✓ Logo loaded</span>}
            {imgStatus === "error" && <span style={{ fontSize: 11, fontWeight: 600, color: "#dc2626" }}>✗ Can't load image</span>}
          </div>

          <div style={{ background: color, padding: "20px 28px", borderRadius: 10, display: "flex", alignItems: "center" }}>
            {imgStatus === "error" ? (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>Logo failed to load</span>
            ) : debouncedUrl ? (
              <img
                key={debouncedUrl}
                src={debouncedUrl}
                alt="Logo"
                loading="lazy"
                style={{ display: "block", width: "auto", maxHeight: 80, objectFit: "contain" }}
                onLoad={() => setImgStatus("ok")}
                onError={() => setImgStatus("error")}
              />
            ) : (
              <div style={{ height: 40, width: 130, background: "rgba(255,255,255,0.18)", borderRadius: 6 }} />
            )}
          </div>

          {imgStatus === "error" && (
            <div style={{ marginTop: 8, padding: "10px 14px", background: "#fee2e2", fontSize: 12, color: "#991b1b", borderRadius: 8, border: "1px solid #fecaca" }}>
              Could not load image — make sure the URL is publicly accessible and links directly to an image file.
            </div>
          )}
        </div>
      ) : (
        !disabled && !value && (
          <div
            style={{ marginTop: 12, border: "2px dashed #e5e7eb", borderRadius: 10, padding: "24px 20px", textAlign: "center", background: "#f9fafb", maxWidth: 480, cursor: "pointer" }}
            onClick={() => setPickerOpen(true)}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
            <p style={{ fontSize: 13, color: "#4f46e5", margin: 0, fontWeight: 600 }}>Browse Shopify Files</p>
            <p style={{ fontSize: 12, color: "#9ca3af", margin: "4px 0 0" }}>or paste a URL above</p>
          </div>
        )
      )}

      {pickerOpen && (
        <ShopifyFilePicker
          onSelect={(url) => { onChange(url); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
