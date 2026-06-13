import React, { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { format } from "date-fns";
import { syncState } from "../lib/sync-state.server";
import { getCachedSettings, getCachedSession } from "../lib/shop-cache.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  const [statusGroups, hiddenCount, settings, setupProgress, recentAlerts, storeSession, alertsToday, shopSyncState, sparkRows, atRiskRaw] = await Promise.all([
    prisma.inventoryTracking.groupBy({ by: ["inventoryStatus"], where: { shop }, _count: { _all: true } }),
    prisma.inventoryTracking.count({ where: { shop, isHidden: true } }),
    getCachedSettings(shop),
    prisma.setupProgress.findUnique({ where: { shop } }),
    prisma.alertHistory.findMany({ where: { shop }, orderBy: { sentAt: "desc" }, take: 10 }),
    getCachedSession(shop),
    prisma.alertHistory.count({ where: { shop, sentAt: { gte: todayStart } } }),
    syncState.get(shop),
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT TO_CHAR(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM alert_history
      WHERE shop = ${shop} AND sent_at >= ${sevenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `,
    prisma.inventoryTracking.findMany({
      where: { shop, inventoryStatus: { in: ["out_of_stock", "low_stock"] } },
      orderBy: [{ inventoryStatus: "asc" }, { currentQuantity: "asc" }],
      take: 8,
      select: { productId: true, productTitle: true, sku: true, currentQuantity: true, inventoryStatus: true },
    }),
  ]);

  const statusCounts = new Map(statusGroups.map((g) => [g.inventoryStatus as string, g._count._all]));
  const stats = {
    totalProducts: (statusCounts.get("in_stock") ?? 0) + (statusCounts.get("low_stock") ?? 0) + (statusCounts.get("out_of_stock") ?? 0),
    outOfStock: statusCounts.get("out_of_stock") ?? 0,
    lowStock: statusCounts.get("low_stock") ?? 0,
    inStock: statusCounts.get("in_stock") ?? 0,
    hidden: hiddenCount,
    deactivated: statusCounts.get("deactivated") ?? 0,
  };

  const setupSteps = [
    setupProgress?.appInstalled ?? true,
    setupProgress?.globalSettingsConfigured ?? false,
    setupProgress?.notificationsConfigured ?? false,
  ];
  const progressPct = Math.round((setupSteps.filter(Boolean).length / setupSteps.length) * 100);

  // Build a 7-element array [oldest … today] for the sparkline
  const rowMap = new Map(sparkRows.map((r) => [r.day, r.count]));
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  const spark7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return rowMap.get(d.toISOString().slice(0, 10)) ?? 0;
  });

  return {
    shop,
    plan: storeSession?.plan ?? "basic",
    stats,
    setupProgress,
    progressPct,
    syncRunning: shopSyncState?.running ?? false,
    lastSyncCompletedAt: shopSyncState?.completedAt?.toISOString() ?? null,
    lastSyncCount: shopSyncState?.syncedCount ?? null,
    recentAlerts: recentAlerts.map((a) => ({
      id: a.id,
      productTitle: a.productTitle,
      alertType: a.alertType,
      sentAt: a.sentAt.toISOString(),
    })),
    notificationEmail: settings?.notificationEmail ?? null,
    alertsToday,
    spark7,
    atRiskProducts: atRiskRaw.map((p) => ({
      productId: p.productId.toString(),
      productTitle: p.productTitle,
      sku: p.sku,
      currentQuantity: p.currentQuantity,
      inventoryStatus: p.inventoryStatus as string,
    })),
  };
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const { shop, plan, stats, setupProgress, progressPct, syncRunning, lastSyncCompletedAt, lastSyncCount, recentAlerts, notificationEmail, alertsToday, spark7, atRiskProducts } =
    useLoaderData<typeof loader>();

  const syncFetcher = useFetcher<{ status?: string; error?: string }>();
  const { syncPct, syncStreamError, clearError, openStream } = useSyncStream(shop, syncRunning);

  useEffect(() => {
    if (syncFetcher.data?.status === "started") openStream();
  }, [syncFetcher.data, openStream]);

  const syncActionError = syncPct === null && syncFetcher.state === "idle" ? (syncFetcher.data?.error ?? null) : null;
  const syncError = syncStreamError ?? syncActionError;

  return (
    <s-page heading="Dashboard" sub-heading="Monitor your inventory and alerts">
      <s-button slot="primary-action" href="/app/products">
        Manage Products
      </s-button>

      {/* Setup progress */}
      {progressPct < 100 && (
        <s-section heading="Setup Progress">
          <s-paragraph>Complete these steps to start monitoring your inventory automatically.</s-paragraph>
          <div style={{ margin: "12px 0" }}>
            <div style={{ background: "#e5e7eb", borderRadius: 4, height: 8 }}>
              <div style={{ background: "#667eea", borderRadius: 4, height: 8, width: `${progressPct}%`, transition: "width .3s" }} />
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{progressPct}% complete</p>
          </div>
          <s-unordered-list>
            <s-list-item>
              {setupProgress?.appInstalled ? "✅" : "⬜"} App Installed
            </s-list-item>
            <s-list-item>
              {setupProgress?.globalSettingsConfigured ? "✅" : "⬜"} Global Settings Configured
            </s-list-item>
            <s-list-item>
              {setupProgress?.notificationsConfigured ? "✅" : "⬜"} Notifications Set Up
            </s-list-item>
          </s-unordered-list>
        </s-section>
      )}

      {/* Inventory stats */}
      <s-section heading="Inventory Overview">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, margin: "8px 0" }}>
          {[
            { label: "Tracked", value: stats.totalProducts, color: "#374151", href: stats.totalProducts > 0 ? "/app/products?filter=tracked" : null },
            { label: "In Stock", value: stats.inStock, color: "#059669", href: stats.inStock > 0 ? "/app/products?filter=in_stock" : null },
            { label: "Low Stock", value: stats.lowStock, color: "#d97706", href: stats.lowStock > 0 ? "/app/products?filter=low_stock" : null },
            { label: "Out of Stock", value: stats.outOfStock, color: "#dc2626", href: stats.outOfStock > 0 ? "/app/products?filter=out_of_stock" : null },
            { label: "Hidden", value: stats.hidden, color: "#6b7280", href: null },
            { label: "Deactivated", value: stats.deactivated, color: "#9ca3af", href: null },
            { label: "Alerts Today", value: alertsToday, color: alertsToday > 0 ? "#d97706" : "#6b7280", href: alertsToday > 0 ? "/app/alert-history" : null },
          ].map((s) => {
            const inner = (
              <>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
              </>
            );
            const base: React.CSSProperties = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, textAlign: "center" };
            return s.href ? (
              <a key={s.label} href={s.href} style={{ ...base, textDecoration: "none", display: "block", transition: "border-color .15s", cursor: "pointer" }}
                onMouseOver={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
                onMouseOut={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
              >
                {inner}
              </a>
            ) : (
              <div key={s.label} style={base}>{inner}</div>
            );
          })}
        </div>
        <AlertSparkline data={spark7} />
        {lastSyncCompletedAt && (
          <p style={{ margin: "10px 0 0", fontSize: 13, color: "#9ca3af" }}>
            Last synced {timeAgo(lastSyncCompletedAt)}{lastSyncCount !== null ? ` · ${lastSyncCount} products` : ""}
          </p>
        )}
      </s-section>

      {/* Products at risk */}
      {atRiskProducts.length > 0 && (
        <s-section heading="Products at Risk">
          <a slot="primary-action" href="/app/products?filter=out_of_stock" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>View all →</a>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {atRiskProducts.map((p) => {
              const isOut = p.inventoryStatus === "out_of_stock";
              return (
                <a
                  key={p.productId}
                  href={`/app/products?filter=out_of_stock`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: isOut ? "#fff5f5" : "#fffbeb", border: `1px solid ${isOut ? "#fca5a5" : "#fde68a"}`, borderRadius: 6, padding: "10px 14px", textDecoration: "none" }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{p.productTitle ?? "—"}</div>
                    {p.sku && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>SKU: {p.sku}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 18, color: isOut ? "#dc2626" : "#d97706" }}>
                      {p.currentQuantity}
                    </span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: isOut ? "#fee2e2" : "#fef3c7", color: isOut ? "#991b1b" : "#92400e", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {isOut ? "Out of Stock" : "Low Stock"}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        </s-section>
      )}

      {/* Recent alerts */}
      <s-section heading="Recent Alerts">
        <a slot="primary-action" href="/app/alert-history" style={{ fontSize: 13, color: "#1d4ed8", textDecoration: "none" }}>View all →</a>
        {recentAlerts.length === 0 ? (
          <s-paragraph>No alerts yet — alerts will appear here when inventory thresholds are triggered.</s-paragraph>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentAlerts.map((alert) => (
              <div key={alert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{alert.productTitle ?? "Unknown Product"}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {alert.alertType === "low_stock" && "Low Stock Alert"}
                    {alert.alertType === "out_of_stock" && "Out of Stock Alert"}
                    {alert.alertType === "restock" && "Back in Stock"}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, padding: "2px 8px", borderRadius: 12, fontWeight: 500,
                  background: alert.alertType === "out_of_stock" ? "#fee2e2" : alert.alertType === "low_stock" ? "#fef3c7" : "#d1fae5",
                  color: alert.alertType === "out_of_stock" ? "#991b1b" : alert.alertType === "low_stock" ? "#92400e" : "#065f46",
                }}>
                  {format(new Date(alert.sentAt), "MMM d, h:mm a")}
                </span>
              </div>
            ))}
          </div>
        )}
      </s-section>

      {/* Store info */}
      <s-section heading="Store Information" slot="aside">
        <s-paragraph><strong>Shop:</strong> {shop}</s-paragraph>
        <s-paragraph>
          <strong>Plan:</strong>{" "}
          <span style={{ background: plan === "pro" ? "#d1fae5" : "#dbeafe", color: plan === "pro" ? "#065f46" : "#1e40af", padding: "1px 8px", borderRadius: 12, fontSize: 12 }}>
            {plan === "pro" ? "Professional" : "Basic"}
          </span>
        </s-paragraph>
        {notificationEmail && <s-paragraph><strong>Alert Email:</strong> {notificationEmail}</s-paragraph>}
      </s-section>

      {/* Quick actions */}
      <s-section heading="Quick Actions" slot="aside">
        <s-stack direction="block" gap="base">
          <DashboardSyncButton
            pct={syncPct}
            submitting={syncFetcher.state !== "idle"}
            onClick={() => { if (syncPct === null && syncFetcher.state === "idle") syncFetcher.submit({ intent: "sync" }, { method: "post", action: "/app/products" }); }}
          />
          {syncError && (
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "10px 12px" }}>
              <p style={{ fontSize: 12, color: "#991b1b", margin: "0 0 8px" }}>{syncError}</p>
              <button
                type="button"
                onClick={() => {
                  clearError();
                  if (syncFetcher.state === "idle") syncFetcher.submit({ intent: "sync" }, { method: "post", action: "/app/products" });
                }}
                style={{ fontSize: 12, padding: "4px 12px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", cursor: "pointer", fontWeight: 600 }}
              >
                Retry
              </button>
            </div>
          )}
          <s-button href="/app/settings">Configure Settings</s-button>
          {plan !== "pro" && <s-button href="/app/billing">Upgrade to Pro</s-button>}
        </s-stack>
      </s-section>
    </s-page>
  );
}

function AlertSparkline({ data }: { data: number[] }) {
  const BAR_W = 28;
  const GAP = 6;
  const BAR_H = 44;
  const LABEL_H = 16;
  const total = data.length; // always 7
  const svgW = total * BAR_W + (total - 1) * GAP;
  const svgH = BAR_H + LABEL_H;
  const max = Math.max(...data, 1);
  const totalAlerts = data.reduce((a, b) => a + b, 0);

  // Day labels: Mon/Tue/... for each of the 7 days
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - i));
    return d.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
  });

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Alerts — last 7 days</span>
        <span style={{ fontSize: 12, color: "#6b7280" }}>{totalAlerts} total</span>
      </div>
      <svg width={svgW} height={svgH} style={{ display: "block", overflow: "visible" }}>
        {data.map((count, i) => {
          const x = i * (BAR_W + GAP);
          const barH = count === 0 ? 2 : Math.max(4, Math.round((count / max) * BAR_H));
          const y = BAR_H - barH;
          const isToday = i === 6;
          return (
            <g key={i}>
              <rect
                x={x} y={y} width={BAR_W} height={barH}
                rx={3}
                fill={count === 0 ? "#f3f4f6" : isToday ? "#d97706" : "#fde68a"}
                stroke={count === 0 ? "#e5e7eb" : isToday ? "#b45309" : "#f59e0b"}
                strokeWidth={1}
              />
              {count > 0 && (
                <text x={x + BAR_W / 2} y={y - 3} textAnchor="middle" fontSize={9} fill="#6b7280">{count}</text>
              )}
              <text x={x + BAR_W / 2} y={svgH - 1} textAnchor="middle" fontSize={9} fill={isToday ? "#374151" : "#9ca3af"} fontWeight={isToday ? 700 : 400}>
                {days[i]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DashboardSyncButton({ pct, submitting, onClick }: { pct: number | null; submitting: boolean; onClick: () => void }) {
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

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
