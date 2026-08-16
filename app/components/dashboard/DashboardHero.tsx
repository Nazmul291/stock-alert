import type { ReactNode } from "react";
import { format } from "date-fns";
import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";
import { useDashboardStore } from "../../stores/dashboard-store";

const DEFAULT_STATS = { totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0, hidden: 0, deactivated: 0, requiresUpgrade: 0 };
const DEFAULT_TREND = { totalProducts: null, inStock: null, lowStock: null, outOfStock: null };
const DEFAULT_RANGE = { start: "", end: "" };

// Real week-over-week change (dashboard-data.server.ts's pctChange, backed
// by DashboardSnapshot rows) — accurate, not decorative. Tinted to the
// card's own accent color (design reference uses one consistent color per
// card rather than a universal good/bad green-red) — the ↑/↓ arrow itself
// still carries the direction. pct is null on a fresh install (no ~7-day-old
// snapshot yet) — rather than hiding the badge (which reads as a missing
// section, same issue already fixed for InventoryHealthInsight and
// RecommendedActionBanner), it shows a neutral "no data yet" state so the
// card's layout never shifts once real data arrives.
function TrendPill({ pct, color, bg }: { pct: number | null; color: string; bg: string }) {
  if (pct === null) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", fontSize: 11.5, fontWeight: 700,
        color: "#9a99a9", background: "#f2f1f7", borderRadius: 8, padding: "5px 9px",
      }}>
        –
      </span>
    );
  }
  const isUp = pct > 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11.5, fontWeight: 700,
      color, background: bg, borderRadius: 8, padding: "5px 9px",
    }}>
      {isUp ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  );
}

// Small stroke-based line icons, 24x24 viewBox — same hand-rolled-SVG
// convention as the edit-pencil icon in ProductsTable.tsx, no icon library.
const ICONS: Record<string, (color: string) => ReactNode> = {
  package: (color) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
    </svg>
  ),
  check: (color) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  warning: (color) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  ),
  x: (color) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6M9 9l6 6" />
    </svg>
  ),
};

// Purely decorative — the design reference's own hand-authored curve per
// card, reproduced verbatim (not derived from statHistory). Per explicit
// direction: these don't need to be real data, just the same visual as the
// reference file (same treatment as the trend badge above).
const SPARKLINE_PATHS: Record<string, string> = {
  package: "M0 44 C14 40 20 30 32 34 C44 38 50 26 62 30 C74 34 80 44 92 40 C104 36 110 22 122 24 C134 26 140 34 152 30 C164 26 172 12 186 16 L200 14",
  check: "M0 40 C12 36 18 44 30 42 C42 40 46 28 58 32 C70 36 74 46 86 44 C98 42 102 30 114 26 C126 22 132 16 144 20 C156 24 162 38 174 40 C186 42 192 34 200 32",
  warning: "M0 34 C12 30 16 40 28 42 C40 44 44 34 56 32 C68 30 72 42 84 44 C96 46 100 30 112 26 C124 22 130 34 142 36 C154 38 160 26 172 24 C184 22 192 30 200 32",
  x: "M0 30 C12 34 16 42 28 40 C40 38 44 44 56 42 C68 40 72 34 84 36 C96 38 100 44 112 42 C124 40 130 34 142 36 C154 38 160 44 172 42 C184 40 192 34 200 32",
};

function MiniSparkline({ icon, color, gradientId }: { icon: string; color: string; gradientId: string }) {
  const linePath = SPARKLINE_PATHS[icon];
  const areaPath = `${linePath} L200 60 L0 60 Z`;
  return (
    <svg viewBox="0 0 200 60" preserveAspectRatio="none" style={{ width: "100%", height: 44, display: "block", marginTop: 10 }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.18} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

// Greeting + read-only date range + 4 stat cards (icon, trend pill, big
// number, subtitle, mini sparkline) — the dashboard's hero, replacing the
// plain stat-tile grid that used to open the page.
export function DashboardHero() {
  const navigate = useShopAwareNavigate();
  const loading = useDashboardStore((s) => s.data === null);
  const greeting = useDashboardStore((s) => s.data?.greeting) ?? "Good morning";
  const shopDisplayName = useDashboardStore((s) => s.data?.shopDisplayName) ?? "";
  const dateRange = useDashboardStore((s) => s.data?.dateRange) ?? DEFAULT_RANGE;
  const stats = useDashboardStore((s) => s.data?.stats) ?? DEFAULT_STATS;
  const trend = useDashboardStore((s) => s.data?.trend) ?? DEFAULT_TREND;

  const rangeLabel = dateRange.start && dateRange.end
    ? `${format(new Date(`${dateRange.start}T00:00:00`), "MMM d")} – ${format(new Date(`${dateRange.end}T00:00:00`), "MMM d")}`
    : null;

  // Each card carries its own accent color end-to-end (icon chip, trend
  // pill, sparkline, card tint) rather than a universal good/bad palette —
  // matches the design reference. Out of Stock stays red (not the
  // reference's blue) since red already means "critical" everywhere else in
  // this app (StatusPill, TopItemsToWatch) — copying blue here would send a
  // conflicting signal for the same status elsewhere on the same page.
  const cards = [
    { label: "Total Products", subtitle: "All products", value: stats.totalProducts, trend: trend.totalProducts, color: "#6d4aff", chipBg: "#efeaff", cardBg: "#fff", cardBorder: "#e9e7f2", icon: "package", href: "/app/products" },
    { label: "Healthy Stock", subtitle: `${stats.totalProducts > 0 ? Math.round((stats.inStock / stats.totalProducts) * 100) : 0}% of total`, value: stats.inStock, trend: trend.inStock, color: "#27ae72", chipBg: "#e2f5ea", cardBg: "#f5fbf7", cardBorder: "#dceee3", icon: "check", href: "/app/products?filter=in_stock" },
    { label: "Low Stock", subtitle: "Need attention", value: stats.lowStock, trend: trend.lowStock, color: "#e79420", chipBg: "#fdeed6", cardBg: "#fffaf2", cardBorder: "#f6e6cd", icon: "warning", href: "/app/products?filter=low_stock" },
    { label: "Out of Stock", subtitle: "Action needed", value: stats.outOfStock, trend: trend.outOfStock, color: "#ee4f4f", chipBg: "#fdeaea", cardBg: "#fef6f6", cardBorder: "#f6dede", icon: "x", href: "/app/products?filter=out_of_stock" },
  ];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <p className={loading ? "skeleton-text" : undefined} style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.4px", color: "#15151f", margin: "0 0 6px" }}>
            {greeting}{shopDisplayName ? `, ${shopDisplayName}` : ""} <span style={{ fontWeight: 400 }}>👋</span>
          </p>
          <p style={{ fontSize: 13.5, color: "#7b7a8c", fontWeight: 500, margin: 0 }}>Here&apos;s your inventory overview for today.</p>
        </div>
        {/* Read-only — displays the same 7-day window the trends/sparklines
            use, not an interactive date picker (no data-scoping feature
            behind it). */}
        {rangeLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 600, color: "#2b2a3c", background: "#fff", border: "1px solid #e4e2ee", borderRadius: 12, padding: "10px 14px" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6d4aff" strokeWidth="1.9" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
            {rangeLabel}
          </span>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        {cards.map((c) => (
          <div
            key={c.label}
            role="button"
            tabIndex={0}
            onClick={() => navigate(c.href)}
            onKeyDown={(e) => e.key === "Enter" && navigate(c.href)}
            style={{ position: "relative", background: c.cardBg, border: `1px solid ${c.cardBorder}`, borderRadius: 16, overflow: "hidden", cursor: "pointer" }}
          >
            <div style={{ padding: "16px 16px 10px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: c.chipBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {ICONS[c.icon](c.color)}
                </div>
                <TrendPill pct={c.trend} color={c.color} bg={c.chipBg} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#3a3950" }}>{c.label}</div>
                <div className={loading ? "skeleton-text" : undefined} style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-.6px", color: "#15151f" }}>{c.value}</div>
                <div style={{ fontSize: 12, color: "#8b8a9c", fontWeight: 500 }}>{c.subtitle}</div>
              </div>
            </div>
            <MiniSparkline icon={c.icon} color={c.color} gradientId={`hero-spark-${c.icon}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
