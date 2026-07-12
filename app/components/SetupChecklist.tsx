import { useShopAwareNavigate } from "../lib/use-shop-aware-navigate";

export function SetupChecklist({
  progress,
  progressPct,
  syncPct,
  syncSubmitting,
  onSync,
}: {
  progress: { appInstalled: boolean; globalSettingsConfigured: boolean; notificationsConfigured: boolean; firstProductTracked: boolean };
  progressPct: number;
  syncPct: number | null;
  syncSubmitting: boolean;
  onSync: () => void;
}) {
  const navigate = useShopAwareNavigate();
  const steps = [
    {
      done: progress.appInstalled,
      title: "Install & subscribe",
      description: "Stock Alert is installed and your plan is active.",
      action: null,
    },
    {
      done: progress.globalSettingsConfigured && progress.notificationsConfigured,
      title: "Configure notifications",
      description: "Set your low-stock threshold and add a notification email or Slack webhook.",
      action: { label: "Go to Settings →", href: "/app/settings" },
    },
    {
      done: progress.firstProductTracked,
      title: "Sync your products",
      description: "Import your Shopify catalog so Stock Alert can monitor inventory levels.",
      action: null,
      syncAction: true,
    },
    {
      done: progress.firstProductTracked,
      title: "Monitoring is live",
      description: "Your products are tracked. You'll receive alerts when stock hits your threshold.",
      action: { label: "View Products →", href: "/app/products" },
    },
  ];

  const syncBusy = syncSubmitting || syncPct !== null;

  return (
    <div style={{ marginBottom: 24, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>Getting Started</span>
          <span style={{ fontSize: 13, color: "#6b7280", marginLeft: 10 }}>{progressPct}% complete</span>
        </div>
        <div style={{ width: 120, background: "#e5e7eb", borderRadius: 4, height: 6 }}>
          <div style={{ background: "#667eea", borderRadius: 4, height: 6, width: `${progressPct}%`, transition: "width .3s" }} />
        </div>
      </div>

      {/* Steps */}
      <div>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 20px",
              borderBottom: i < steps.length - 1 ? "1px solid #f9fafb" : "none",
              opacity: step.done ? 0.6 : 1,
            }}
          >
            {/* Step indicator */}
            <div style={{
              flexShrink: 0, width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: step.done ? "#059669" : "#f3f4f6",
              border: `2px solid ${step.done ? "#059669" : "#e5e7eb"}`,
              fontSize: 12, fontWeight: 700, color: step.done ? "#fff" : "#9ca3af",
            }}>
              {step.done ? "✓" : i + 1}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: step.done ? "#6b7280" : "#111827", marginBottom: 2 }}>
                {step.title}
              </div>
              <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.4 }}>{step.description}</div>
            </div>

            {/* Action */}
            {!step.done && step.syncAction && (
              <button
                type="button"
                onClick={onSync}
                disabled={syncBusy}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 6, border: "1px solid #667eea",
                  background: syncBusy ? "#f3f4f6" : "#667eea", color: syncBusy ? "#9ca3af" : "#fff",
                  fontSize: 13, fontWeight: 600, cursor: syncBusy ? "not-allowed" : "pointer", whiteSpace: "nowrap",
                }}
              >
                {syncPct !== null ? `Syncing ${Math.round(syncPct)}%…` : syncSubmitting ? "Starting…" : "Sync Products →"}
              </button>
            )}
            {!step.done && step.action && (
              <button
                type="button"
                onClick={() => navigate(step.action!.href)}
                style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: 6, border: "1px solid #667eea",
                  background: "#667eea", color: "#fff", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {step.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
