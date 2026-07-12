export function DashboardSyncButton({ pct, submitting, onClick }: { pct: number | null; submitting: boolean; onClick: () => void }) {
  const busy = submitting || pct !== null;
  const displayPct = Math.round(pct ?? 0);
  const label = pct !== null ? `Syncing ${displayPct}%` : submitting ? "Starting…" : "Sync Products";
  return (
    <s-button
      variant="primary"
      disabled={busy ? true : undefined}
      onClick={!busy ? onClick : undefined}
    >
      {label}
    </s-button>
  );
}
