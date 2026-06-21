import type { CSSProperties } from "react";

// Reuses the `pulse` keyframes already defined globally for the embedded app
// in app/routes/app.tsx's <GlobalStyles>.
export function SkeletonBlock({ width, height, borderRadius = 6, style }: {
  width: number | string;
  height: number | string;
  borderRadius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius,
        background: "#e5e7eb",
        animation: "pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}
