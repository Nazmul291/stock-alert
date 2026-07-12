export function ProductSyncButton({ pct, busy, onClick, slot }: {
  pct: number | null;
  busy: boolean;
  onClick: () => void;
  slot?: Lowercase<string>;
}) {
  const syncing = pct !== null;
  const displayPct = Math.round(pct ?? 0);
  const active = syncing || busy;
  return (
    <s-button
      slot={slot}
      variant="primary"
      disabled={active ? true : undefined}
      onClick={!active ? onClick : undefined}
    >
      {syncing ? `Syncing ${displayPct}%` : busy ? "Syncing…" : "Sync Products"}
    </s-button>
  );
}
