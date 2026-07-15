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
    // suppressHydrationWarning: s-button injects its own `style` attribute
    // during server rendering, outside anything declared in this JSX —
    // React's hydration diff otherwise flags that as a false-positive
    // mismatch. @ts-expect-error since the generated JSX type for this
    // custom element doesn't extend React's base DOM attributes, even
    // though React honors this prop on any element at runtime.
    <s-button
      slot={slot}
      variant="primary"
      disabled={active ? true : undefined}
      onClick={!active ? onClick : undefined}
      // @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type
      suppressHydrationWarning
    >
      {syncing ? `Syncing ${displayPct}%` : busy ? "Syncing…" : "Sync Products"}
    </s-button>
  );
}
