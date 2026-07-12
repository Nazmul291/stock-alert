function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function WebhookHealthBar({
  lastWebhookAt,
  lastSyncCompletedAt,
  lastSyncCount,
}: {
  lastWebhookAt: string | null;
  lastSyncCompletedAt: string | null;
  lastSyncCount: number | null;
}) {
  const now = Date.now();
  const webhookAge = lastWebhookAt ? (now - new Date(lastWebhookAt).getTime()) / 3_600_000 : null;

  let dot: string;
  let label: string;
  let color: string;
  let bg: string;
  let border: string;

  if (webhookAge === null) {
    dot = "⬤";
    label = "No webhooks received yet — sync your products to start monitoring";
    color = "#6b7280";
    bg = "#f9fafb";
    border = "#e5e7eb";
  } else if (webhookAge < 1) {
    dot = "⬤";
    label = `Webhooks active — last received ${timeAgo(lastWebhookAt!)}`;
    color = "#059669";
    bg = "#f0fdf4";
    border = "#86efac";
  } else if (webhookAge < 24) {
    dot = "⬤";
    label = `Last webhook ${timeAgo(lastWebhookAt!)} — monitoring active`;
    color = "#d97706";
    bg = "#fffbeb";
    border = "#fde68a";
  } else {
    dot = "⬤";
    label = `No webhook in ${Math.floor(webhookAge)}h — inventory data may be stale`;
    color = "#dc2626";
    bg = "#fff5f5";
    border = "#fca5a5";
  }

  return (
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: "4px 10px" }}>
        <span style={{ fontSize: 8, color, lineHeight: 1 }}>{dot}</span>
        <span style={{ fontSize: 12, color, fontWeight: 500 }}>{label}</span>
      </div>
      {lastSyncCompletedAt && (
        <span style={{ fontSize: 12, color: "#9ca3af" }}>
          Last full sync {timeAgo(lastSyncCompletedAt)}{lastSyncCount !== null ? ` · ${lastSyncCount} products` : ""}
        </span>
      )}
    </div>
  );
}
