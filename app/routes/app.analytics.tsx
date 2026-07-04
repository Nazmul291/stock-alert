import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { SkeletonBlock, SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { AnalyticsData } from "../lib/analytics-data.server";
import { useSSEData } from "../hooks/use-sse-data";

// Only the auth check blocks the response — the analytics query runs entirely
// in the background via api.analytics-stream.ts and is pushed to the client
// over SSE once it resolves. loadAnalyticsData itself lives in
// app/lib/analytics-data.server.ts, not here — see app._index.tsx's loader
// comment for why a plain exported function can't stay in a route file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const token = await mintSseToken(shop);
  return { token };
};

export default function AnalyticsPage() {
  const { token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<AnalyticsData>(
    `/api/analytics-stream?token=${encodeURIComponent(token)}`,
  );

  return (
    <s-page heading="Analytics" sub-heading="Alert trends and inventory health over the last 30 days">
      {error ? (
        <SSEErrorRetry message={error} onRetry={retry} />
      ) : data ? (
        <AnalyticsContent data={data} />
      ) : (
        <AnalyticsSkeleton />
      )}
    </s-page>
  );
}

function AnalyticsContent({ data }: { data: AnalyticsData }) {
  return (
    <>
      {/* Summary stat cards */}
      <StatCards data={data} />

      {/* Row 2: Type breakdown + Channel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <s-section heading="Alert Types">
          <AlertTypeBreakdown data={data.typeBreakdown} total={data.totalThisMonth} />
        </s-section>
        <s-section heading="Notification Channels">
          <ChannelBreakdown email={data.channel.email} slack={data.channel.slack} />
        </s-section>
      </div>

      {/* Daily volume chart */}
      <s-section heading="Daily Alert Volume — Last 30 Days">
        <DailyBarChart data={data.daily30} />
      </s-section>

      {/* Top products */}
      {data.topProducts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <s-section heading="Most Alerted Products">
            <TopProductsChart data={data.topProducts} />
          </s-section>
        </div>
      )}

      {/* Stock health */}
      <div style={{ marginTop: 16 }}>
        <s-section heading="Current Stock Health">
          <StockHealthBar health={data.stockHealth} />
        </s-section>
      </div>

      {data.totalThisMonth === 0 && (
        <div style={{ marginTop: 24, padding: "32px", textAlign: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <p style={{ fontWeight: 600, color: "#374151", marginBottom: 6 }}>No alerts yet</p>
          <p style={{ fontSize: 14, color: "#6b7280" }}>Analytics will appear once Stock Alert starts firing notifications.</p>
        </div>
      )}
    </>
  );
}

function AnalyticsSkeleton() {
  return (
    <>
      <StatCardsSkeleton />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <s-section heading="Alert Types"><DonutSkeleton /></s-section>
        <s-section heading="Notification Channels"><ChannelSkeleton /></s-section>
      </div>
      <s-section heading="Daily Alert Volume — Last 30 Days">
        <SkeletonBlock width="100%" height={82} />
      </s-section>
      <div style={{ marginTop: 16 }}>
        <s-section heading="Current Stock Health">
          <SkeletonBlock width="100%" height={20} borderRadius={6} />
        </s-section>
      </div>
    </>
  );
}

function StatCards({ data }: { data: AnalyticsData }) {
  const { totalThisMonth, totalLastMonth, avgPerDay, busiest } = data;
  const pctChange = totalLastMonth === 0
    ? null
    : Math.round(((totalThisMonth - totalLastMonth) / totalLastMonth) * 100);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12, marginBottom: 24 }}>
      <StatCard label="Alerts (30 days)" value={totalThisMonth} color="#4f46e5" />
      <StatCard
        label="vs Previous 30 days"
        value={pctChange === null ? "—" : `${pctChange >= 0 ? "+" : ""}${pctChange}%`}
        color={pctChange === null ? "#9ca3af" : pctChange > 0 ? "#dc2626" : "#059669"}
        sub={`${totalLastMonth} last period`}
      />
      <StatCard label="Avg alerts / day" value={avgPerDay.toFixed(1)} color="#374151" />
      <StatCard
        label="Busiest day"
        value={busiest.count === 0 ? "—" : busiest.count}
        color="#d97706"
        sub={busiest.day ? new Date(busiest.day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : ""}
      />
    </div>
  );
}

function StatCardsSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 12, marginBottom: 24 }}>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
          <SkeletonBlock width={56} height={28} style={{ marginBottom: 8 }} />
          <SkeletonBlock width={100} height={13} />
        </div>
      ))}
    </div>
  );
}

function DonutSkeleton() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <SkeletonBlock width={112} height={112} borderRadius={56} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} width={120} height={14} />)}
      </div>
    </div>
  );
}

function ChannelSkeleton() {
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

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color, sub }: { label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "16px 18px" }}>
      <div style={{ fontSize: 28, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#374151", marginTop: 4, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Alert type donut ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { color: string; label: string }> = {
  low_stock:    { color: "#f59e0b", label: "Low Stock" },
  out_of_stock: { color: "#ef4444", label: "Out of Stock" },
  restock:      { color: "#10b981", label: "Restock" },
};

function AlertTypeBreakdown({ data, total }: { data: { type: string; count: number }[]; total: number }) {
  if (total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No data yet.</p>;

  const R = 46;
  const CX = 56;
  const CY = 56;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  const segments = data.map((d) => {
    const frac = d.count / total;
    const dash = frac * circumference;
    const seg = { ...d, dash, offset, frac };
    offset += dash;
    return seg;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={112} height={112} viewBox="0 0 112 112" style={{ flexShrink: 0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f3f4f6" strokeWidth={18} />
        {segments.map((s) => {
          const c = TYPE_COLORS[s.type]?.color ?? "#9ca3af";
          return (
            <circle
              key={s.type}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={c}
              strokeWidth={18}
              strokeDasharray={`${s.dash} ${circumference - s.dash}`}
              strokeDashoffset={-s.offset + circumference / 4}
              style={{ transition: "stroke-dasharray 0.3s" }}
            />
          );
        })}
        <text x={CX} y={CY + 1} textAnchor="middle" dominantBaseline="middle" fontSize={16} fontWeight={700} fill="#111827">
          {total}
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" dominantBaseline="middle" fontSize={9} fill="#6b7280">
          total
        </text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((d) => {
          const meta = TYPE_COLORS[d.type] ?? { color: "#9ca3af", label: d.type };
          const pct = Math.round((d.count / total) * 100);
          return (
            <div key={d.type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: "#374151" }}>{meta.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginLeft: "auto", paddingLeft: 12 }}>{d.count}</span>
              <span style={{ fontSize: 12, color: "#9ca3af", width: 32, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Channel breakdown ─────────────────────────────────────────────────────────

function ChannelBreakdown({ email, slack }: { email: number; slack: number }) {
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

// ── 30-day bar chart ──────────────────────────────────────────────────────────

function DailyBarChart({ data }: { data: { day: string; count: number }[] }) {
  const BAR_W = 16;
  const GAP   = 4;
  const BAR_H = 64;
  const LABEL_H = 18;
  const total = data.length;
  const svgW = total * (BAR_W + GAP) - GAP;
  const svgH = BAR_H + LABEL_H;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div style={{ overflowX: "auto", paddingBottom: 4 }}>
      <svg width={svgW} height={svgH} style={{ display: "block", minWidth: svgW }}>
        {data.map((d, i) => {
          const x = i * (BAR_W + GAP);
          const barH = d.count === 0 ? 2 : Math.max(4, Math.round((d.count / max) * BAR_H));
          const y = BAR_H - barH;
          const isToday = i === data.length - 1;
          const isWeekend = [0, 6].includes(new Date(d.day + "T00:00:00Z").getUTCDay());
          const fill   = d.count === 0 ? "#f3f4f6" : isToday ? "#4f46e5" : "#a5b4fc";
          const stroke = d.count === 0 ? "#e5e7eb" : isToday ? "#3730a3" : "#818cf8";

          // Show day-of-month label every 5 bars and on first/last
          const date = new Date(d.day + "T00:00:00Z");
          const showLabel = i === 0 || i === data.length - 1 || date.getUTCDate() % 5 === 0;
          const labelText = showLabel ? date.getUTCDate().toString() : "";

          return (
            <g key={d.day}>
              <rect x={x} y={y} width={BAR_W} height={barH} rx={2} fill={fill} stroke={stroke} strokeWidth={1}>
                <title>{d.day}: {d.count} alert{d.count !== 1 ? "s" : ""}</title>
              </rect>
              {d.count > 0 && d.count === max && (
                <text x={x + BAR_W / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="#374151" fontWeight={600}>
                  {d.count}
                </text>
              )}
              {labelText && (
                <text x={x + BAR_W / 2} y={BAR_H + 13} textAnchor="middle" fontSize={9} fill={isWeekend ? "#d1d5db" : "#9ca3af"}>
                  {labelText}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#4f46e5", borderRadius: 2, display: "inline-block" }} /> Today
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#a5b4fc", borderRadius: 2, display: "inline-block" }} /> Previous days
        </span>
      </div>
    </div>
  );
}

// ── Top products horizontal bars ──────────────────────────────────────────────

function TopProductsChart({ data }: { data: { title: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d, i) => {
        const pct = Math.round((d.count / maxCount) * 100);
        return (
          <div key={d.title}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 13 }}>
              <span style={{ color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>
                <span style={{ color: "#9ca3af", marginRight: 6, fontVariantNumeric: "tabular-nums" }}>#{i + 1}</span>
                {d.title ?? "Unknown"}
              </span>
              <span style={{ fontWeight: 700, color: "#111827", flexShrink: 0 }}>{d.count}</span>
            </div>
            <div style={{ height: 6, background: "#f3f4f6", borderRadius: 3 }}>
              <div style={{ height: 6, background: i === 0 ? "#4f46e5" : "#a5b4fc", borderRadius: 3, width: `${pct}%`, transition: "width 0.3s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Stock health stacked bar ──────────────────────────────────────────────────

function StockHealthBar({ health }: { health: { inStock: number; lowStock: number; outOfStock: number; deactivated: number } }) {
  const total = health.inStock + health.lowStock + health.outOfStock + health.deactivated;
  if (total === 0) return <p style={{ fontSize: 14, color: "#9ca3af" }}>No products tracked yet.</p>;

  const segments = [
    { label: "In Stock",    count: health.inStock,    color: "#10b981" },
    { label: "Low Stock",   count: health.lowStock,   color: "#f59e0b" },
    { label: "Out of Stock",count: health.outOfStock, color: "#ef4444" },
    { label: "Deactivated", count: health.deactivated,color: "#d1d5db" },
  ].filter((s) => s.count > 0);

  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
        {segments.map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${s.count}`}
            style={{ flex: s.count, background: s.color, transition: "flex 0.3s" }}
          />
        ))}
      </div>
      {/* Legend */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: "8px 16px" }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#374151" }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: "#111827", marginLeft: "auto" }}>{s.count}</span>
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{Math.round((s.count / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
