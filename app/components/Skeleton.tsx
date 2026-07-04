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

// Shown in place of a skeleton/content when a useSSEData() stream fails —
// e.g. the dev server restarts mid-load or the client loses connectivity.
export function SSEErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 12px" }}>
      <p style={{ fontSize: 12, color: "#991b1b", margin: "0 0 8px" }}>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", cursor: "pointer", fontWeight: 600 }}
      >
        Retry
      </button>
    </div>
  );
}
