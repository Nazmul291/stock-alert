import { useAnalyticsStore } from "../../stores/analytics-store";

const DEFAULT_CHANNEL = { email: 0, slack: 0 };

export function ChannelBreakdown() {
  const loading = useAnalyticsStore((s) => s.data === null);
  const { email, slack } = useAnalyticsStore((s) => s.data?.channel) ?? DEFAULT_CHANNEL;
  const total = email + slack;
  // Genuinely-empty state — loading has its own visual state below, so this
  // only appears once data has confirmed there's nothing.
  if (!loading && total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No notifications sent yet.</p>;

  const channels = [
    { label: "Email", count: email, color: "#4f46e5", icon: "✉️" },
    { label: "Slack", count: slack, color: "#7c3aed", icon: "💬" },
  ];
  const safeTotal = total || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {channels.map((ch) => {
        const pct = Math.round((ch.count / safeTotal) * 100);
        return (
          <div key={ch.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
              <span>{ch.icon} {ch.label}</span>
              <span className={loading ? "skeleton-text" : undefined} style={{ fontWeight: 600 }}>{ch.count} <span style={{ fontWeight: 400, color: "#9ca3af" }}>({pct}%)</span></span>
            </div>
            <div style={{ height: 8, background: "#f3f4f6", borderRadius: 4 }}>
              <div style={{ height: 8, background: ch.color, borderRadius: 4, width: `${pct}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
