export function DashboardSyncButton({ pct, submitting, onClick }: { pct: number | null; submitting: boolean; onClick: () => void }) {
  const busy = submitting || pct !== null;
  const displayPct = Math.round(pct ?? 0);
  const label = pct !== null ? `Syncing ${displayPct}%` : submitting ? "Starting…" : "Sync Products";
  return (
    // suppressHydrationWarning: s-button injects its own `style` attribute
    // during server rendering, outside anything declared in this JSX —
    // React's hydration diff otherwise flags that as a false-positive
    // mismatch. @ts-expect-error since the generated JSX type for this
    // custom element doesn't extend React's base DOM attributes, even
    // though React honors this prop on any element at runtime.
    <s-button
      variant="primary"
      disabled={busy ? true : undefined}
      onClick={!busy ? onClick : undefined}
      // @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type
      suppressHydrationWarning
    >
      {label}
    </s-button>
  );
}
