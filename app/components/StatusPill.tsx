import type { CSSProperties, ReactNode } from "react";

// Shared chrome for every colored status/state badge in the app (product
// stock status, PO status, alert type, reorder urgency, days-left) — these
// used to duplicate the same padding/borderRadius/fontSize inline across
// ~8 components with small unintentional drifts (11px vs 12px, weight 500
// vs 600, radius 10 vs 12). Only the bg/color/label vary per domain; those
// stay in each component's own status map.
const SIZES: Record<"xs" | "sm" | "md", CSSProperties> = {
  xs: { padding: "2px 8px", fontSize: 11 },
  sm: { padding: "2px 8px", fontSize: 12 },
  md: { padding: "4px 10px", fontSize: 13 },
};

export function StatusPill({
  label,
  bg,
  color,
  size = "sm",
  title,
  className,
  style,
}: {
  label: ReactNode;
  bg: string;
  color: string;
  size?: "xs" | "sm" | "md";
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      title={title}
      style={{
        display: "inline-block",
        borderRadius: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: bg,
        color,
        ...SIZES[size],
        ...style,
      }}
    >
      {label}
    </span>
  );
}
