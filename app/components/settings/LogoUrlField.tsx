import { useState, useEffect } from "react";
import { fieldLabel, helpText } from "../IntegrationControls";
import { ShopifyFilePicker } from "./ShopifyFilePicker";

/* ── Logo field: Shopify file picker only + live email preview ── */
export function LogoUrlField({
  value, brandColor, disabled, onChange,
}: {
  value: string;
  brandColor: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const [imgStatus, setImgStatus] = useState<"idle" | "ok" | "error">("idle");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Resets the loaded/error badge whenever a new file is selected — the
  // <img key={value}> below already remounts and re-fires onLoad/onError,
  // this just avoids a stale badge flashing before that resolves.
  useEffect(() => { setImgStatus("idle"); }, [value]);

  const isValidUrl = (u: string) => { try { return Boolean(new URL(u)); } catch { return false; } };
  const showPreview = value && isValidUrl(value);
  const color = brandColor || "#4f46e5";

  return (
    <div>
      <label style={fieldLabel}>Logo</label>

      {/* Shopify Files only — no manual URL entry, so every logo is always
          a real file the merchant actually uploaded, not an arbitrary
          (and possibly dead) external link. */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
            {value ? "Change File" : "Browse Files"}
          </button>
        )}
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            style={{
              padding: "9px 12px", borderRadius: 8, border: "none",
              background: "none", color: "#6b7280", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Remove
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
            ) : value ? (
              <img
                key={value}
                src={value}
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
              Could not load this file — try selecting it again from Shopify Files.
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
