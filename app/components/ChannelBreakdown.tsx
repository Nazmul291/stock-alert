import { SkeletonBlock } from "./Skeleton";

export function ChannelBreakdown({ email, slack }: { email: number; slack: number }) {
  const total = email + slack;
  if (total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No notifications sent yet.</p>;

  const channels = [
    { label: "Email", count: email, color: "#4f46e5", icon: "✉️" },
    { label: "Slack", count: slack, color: "#7c3aed", icon: "💬" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {channels.map((ch) => {
        const pct = total === 0 ? 0 : Math.round((ch.count / total) * 100);
        return (
          <div key={ch.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
              <span>{ch.icon} {ch.label}</span>
              <span style={{ fontWeight: 600 }}>{ch.count} <span style={{ fontWeight: 400, color: "#9ca3af" }}>({pct}%)</span></span>
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

export function ChannelBreakdownSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i}>
          <SkeletonBlock width="100%" height={13} style={{ marginBottom: 6 }} />
          <SkeletonBlock width="100%" height={8} borderRadius={4} />
        </div>
      ))}
    </div>
  );
}
