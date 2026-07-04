import type { CSSProperties } from "react";

// Shared field styling — used by both app.settings.tsx and app.integrations.tsx
// so the two pages' forms look identical.
export const inputStyle = (hasError = false): CSSProperties => ({
  width: "100%",
  border: `1.5px solid ${hasError ? "#fca5a5" : "#d1d5db"}`,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
  color: "#111827",
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
  transition: "border-color 0.15s",
});

export const fieldLabel: CSSProperties = {
  display: "block",
  fontWeight: 600,
  fontSize: 13,
  color: "#374151",
  marginBottom: 5,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

export const helpText: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 5,
  lineHeight: 1.5,
};

export type TestResult = {
  error?: string;
  email?: { sent: boolean; to?: string; error?: string };
  slack?: { sent: boolean; error?: string };
  whatsapp?: { sent: boolean; error?: string };
  klaviyo?: { sent: boolean; error?: string };
};

/* ── Test result toast — shared by Settings (email only) and Integrations
   (Slack/WhatsApp/Klaviyo) ── */
export function TestResultBanner({ result, onDismiss }: { result: TestResult; onDismiss?: () => void }) {
  const rows: { ok: boolean; text: string }[] = [];

  if (result.error) {
    rows.push({ ok: false, text: result.error });
  } else {
    if (result.email) rows.push({ ok: result.email.sent, text: result.email.sent ? `Email sent to ${result.email.to}` : `Email failed: ${result.email.error}` });
    if (result.slack) rows.push({ ok: result.slack.sent, text: result.slack.sent ? "Slack message sent" : `Slack failed: ${result.slack.error}` });
    if (result.whatsapp) rows.push({ ok: result.whatsapp.sent, text: result.whatsapp.sent ? "WhatsApp message sent" : `WhatsApp failed: ${result.whatsapp.error}` });
    if (result.klaviyo) rows.push({ ok: result.klaviyo.sent, text: result.klaviyo.sent ? "Klaviyo event sent" : `Klaviyo failed: ${result.klaviyo.error}` });
    if (!result.email && !result.slack && !result.whatsapp && !result.klaviyo) rows.push({ ok: false, text: "No notification channels enabled." });
  }

  return (
    <div style={{
      background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #f3f4f6" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Test Notification</span>
        {onDismiss && (
          <button type="button" onClick={onDismiss} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        )}
      </div>
      <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: r.ok ? "#065f46" : "#991b1b" }}>
            <span style={{ flexShrink: 0, marginTop: 1 }}>{r.ok ? "✓" : "✗"}</span>
            <span>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Toggle switch — purely visual, form value is a hidden input in the parent Form ── */
export function Toggle({
  label, description, checked, disabled, onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (val: boolean) => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
      padding: "12px 0", borderBottom: "1px solid #f3f4f6",
      opacity: disabled ? 0.5 : 1,
    }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{description}</div>}
      </div>
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange?.(!checked)}
        style={{ cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0 }}
      >
        <div style={{
          width: 44, height: 24, borderRadius: 12,
          background: checked && !disabled ? "#4f46e5" : "#d1d5db",
          position: "relative", transition: "background 0.2s",
        }}>
          <div style={{
            position: "absolute", top: 2,
            left: checked && !disabled ? 22 : 2,
            width: 20, height: 20, borderRadius: 10,
            background: "#fff", transition: "left 0.2s",
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
          }} />
        </div>
      </div>
    </div>
  );
}

/* ── Connect/disconnect row — used by integrations that authenticate via a
   modal or OAuth handoff (Email, Klaviyo, Slack) instead of an inline toggle ── */
export function ConnectRow({
  icon, title, connected, connectedLabel, connectLabel = "Connect", onConnect, onDisconnect, disconnecting, badge, badgeColor, locked, lockedNode, hideEdit,
}: {
  icon: React.ReactNode;
  title: string;
  connected: boolean;
  connectedLabel?: React.ReactNode;
  connectLabel?: string;
  onConnect: () => void;
  onDisconnect?: () => void;
  disconnecting?: boolean;
  badge?: string | null;
  badgeColor?: string;
  locked?: boolean;
  lockedNode?: React.ReactNode;
  hideEdit?: boolean;
}) {
  return (
    <div style={{
      border: `1.5px solid ${connected ? "#4f46e5" : "#e5e7eb"}`,
      borderRadius: 10, marginBottom: 12, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px", background: connected ? "#fafafe" : "#f9fafb", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {icon}
          <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{title}</span>
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 700, background: badgeColor ?? "#4f46e5", color: "#fff", padding: "2px 8px", borderRadius: 20 }}>
              {badge}
            </span>
          )}
        </div>
        {locked ? lockedNode : connected ? (
          <div style={{ display: "flex", gap: 8 }}>
            {!hideEdit && (
              <button
                type="button"
                onClick={onConnect}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Edit
              </button>
            )}
            {onDisconnect && (
              <button
                type="button"
                disabled={disconnecting}
                onClick={onDisconnect}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: disconnecting ? "not-allowed" : "pointer" }}
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#4f46e5", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            {connectLabel}
          </button>
        )}
      </div>
      {connected && connectedLabel && (
        <div style={{ padding: "12px 16px", fontSize: 13, color: "#374151" }}>
          {connectedLabel}
        </div>
      )}
    </div>
  );
}

/* ── Popup used by ConnectRow's "Connect"/"Edit" button to collect the
   input field(s) an integration needs (email address, API key, etc.) ── */
export function ConnectModal({
  title, icon, onClose, onSubmit, submitting, submitLabel = "Connect", error, children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(17,24,39,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 3000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, width: "100%", maxWidth: 440,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {icon}
            <span style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>{title}</span>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          {error && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 12px", marginBottom: 14, color: "#991b1b", fontSize: 13 }}>
              {error}
            </div>
          )}
          {children}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid #f3f4f6", background: "#f9fafb" }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, fontWeight: 600, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Notification/integration channel card ── */
export function ChannelCard({
  icon, title, badge, badgeColor, enabled, onToggle, disabled, children,
}: {
  icon: React.ReactNode;
  title: string;
  badge: string | null;
  badgeColor?: string;
  enabled: boolean;
  onToggle?: (v: boolean) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      border: `1.5px solid ${enabled && !disabled ? "#4f46e5" : "#e5e7eb"}`,
      borderRadius: 10, marginBottom: 12, overflow: "hidden",
      transition: "border-color 0.2s",
    }}>
      {/* Card header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 16px",
        background: enabled && !disabled ? "#fafafe" : "#f9fafb",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>{icon}</span>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{title}</span>
          {badge && (
            <span style={{ fontSize: 11, fontWeight: 700, background: badgeColor ?? "#4f46e5", color: "#fff", padding: "2px 8px", borderRadius: 20 }}>
              {badge}
            </span>
          )}
        </div>
        <div
          role="switch"
          aria-checked={enabled}
          onClick={() => !disabled && onToggle?.(!enabled)}
          style={{ cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }}
        >
          <div style={{
            width: 44, height: 24, borderRadius: 12,
            background: enabled && !disabled ? "#4f46e5" : "#d1d5db",
            position: "relative", transition: "background 0.2s",
          }}>
            <div style={{
              position: "absolute", top: 2,
              left: enabled ? 22 : 2,
              width: 20, height: 20, borderRadius: 10,
              background: "#fff", transition: "left 0.2s",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            }} />
          </div>
        </div>
      </div>

      {/* Card body — only shown when enabled */}
      {enabled && !disabled && (
        <div style={{ padding: "16px 16px" }}>
          {children}
        </div>
      )}
    </div>
  );
}
