import { useEffect, useRef, useState } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { format } from "date-fns";
import { syncState } from "../lib/sync-state.server";

const PRODUCTS_TRACKING_QUERY = `
  query ($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          legacyResourceId
          variants(first: 100) {
            edges { node { inventoryItem { tracked } } }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const [tracking, settings, setupProgress, recentAlerts] = await Promise.all([
    prisma.inventoryTracking.findMany({ where: { shop }, select: { productId: true, currentQuantity: true, isHidden: true, inventoryStatus: true } }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.setupProgress.findUnique({ where: { shop } }),
    prisma.alertHistory.findMany({ where: { shop }, orderBy: { sentAt: "desc" }, take: 10 }),
  ]);

  const threshold = settings?.lowStockThreshold ?? 5;

  // Fetch Shopify products to identify which have Shopify inventory tracking disabled
  const untrackedShopifyIds = new Set<string>();
  let shopifyTotal = tracking.length;
  try {
    let after: string | null = null;
    let more = true;
    let count = 0;
    while (more) {
      const r = await admin.graphql(PRODUCTS_TRACKING_QUERY, { variables: { first: 250, after } });
      const j: any = await r.json();
      for (const { node } of j.data?.products?.edges ?? []) {
        count++;
        const variants: any[] = node.variants.edges;
        if (variants.length > 0 && variants.every((v) => !v.node.inventoryItem?.tracked)) {
          untrackedShopifyIds.add(node.legacyResourceId);
        }
      }
      more = j.data?.products?.pageInfo?.hasNextPage ?? false;
      after = j.data?.products?.pageInfo?.endCursor ?? null;
    }
    shopifyTotal = count;
  } catch {
    // Non-fatal — fall back to DB-only counts
  }

  // Exclude Shopify-untracked products from inventory status counts
  const trackedRows = tracking.filter((t) => !untrackedShopifyIds.has(t.productId.toString()));

  const stats = {
    totalProducts: shopifyTotal,
    outOfStock: trackedRows.filter((p) => p.currentQuantity <= 0).length,
    lowStock: trackedRows.filter((p) => p.currentQuantity > 0 && p.currentQuantity <= threshold).length,
    inStock: trackedRows.filter((p) => p.currentQuantity > threshold).length,
    hidden: tracking.filter((p) => p.isHidden).length,
    deactivated: tracking.filter((p) => p.inventoryStatus === "deactivated").length,
    notTracked: untrackedShopifyIds.size,
  };

  const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });

  const setupSteps = [
    setupProgress?.appInstalled ?? true,
    setupProgress?.globalSettingsConfigured ?? false,
    setupProgress?.notificationsConfigured ?? false,
  ];
  const progressPct = Math.round((setupSteps.filter(Boolean).length / setupSteps.length) * 100);

  return {
    shop,
    plan: storeSession?.plan ?? "basic",
    stats,
    setupProgress,
    progressPct,
    syncRunning: syncState.get(shop)?.running ?? false,
    recentAlerts: recentAlerts.map((a) => ({
      id: a.id,
      productTitle: a.productTitle,
      alertType: a.alertType,
      sentAt: a.sentAt.toISOString(),
    })),
    notificationEmail: settings?.notificationEmail ?? null,
  };
};

export default function Dashboard() {
  const { shop, plan, stats, setupProgress, progressPct, syncRunning, recentAlerts, notificationEmail } =
    useLoaderData<typeof loader>();

  const syncFetcher = useFetcher<{ status?: string; error?: string }>();
  const { revalidate } = useRevalidator();
  const [syncPct, setSyncPct] = useState<number | null>(null);
  const [syncStreamError, setSyncStreamError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const openSseStream = () => {
    if (esRef.current) return;
    setSyncStreamError(null);
    const es = new EventSource(`/api/sync-stream?shop=${encodeURIComponent(shop)}`);
    esRef.current = es;
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "progress") setSyncPct(data.pct);
      if (data.type === "done") {
        setSyncPct(100);
        es.close(); esRef.current = null;
        setTimeout(() => { setSyncPct(null); revalidate(); }, 1000);
      }
      if (data.type === "idle") {
        es.close(); esRef.current = null; setSyncPct(null);
      }
      if (data.type === "error" || data.type === "auth_error") {
        setSyncStreamError(data.message ?? "Sync failed — network error.");
        es.close(); esRef.current = null; setSyncPct(null);
      }
    };
    es.onerror = () => {
      setSyncStreamError("Sync connection lost. Please retry.");
      es.close(); esRef.current = null; setSyncPct(null);
    };
  };

  useEffect(() => {
    if (syncFetcher.data?.status === "started") openSseStream();
  }, [syncFetcher.data]);

  useEffect(() => {
    if (syncRunning && !esRef.current) openSseStream();
  }, [syncRunning]);

  useEffect(() => () => { esRef.current?.close(); }, []);

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
            { label: "Total", value: stats.totalProducts, color: "#374151" },
            { label: "In Stock", value: stats.inStock, color: "#059669" },
            { label: "Low Stock", value: stats.lowStock, color: "#d97706" },
            { label: "Out of Stock", value: stats.outOfStock, color: "#dc2626" },
            { label: "Hidden", value: stats.hidden, color: "#6b7280" },
            { label: "Deactivated", value: stats.deactivated, color: "#9ca3af" },
            { label: "Not Tracked", value: stats.notTracked, color: "#7c3aed" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </s-section>

      {/* Recent alerts */}
      <s-section heading="Recent Alerts">
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
                  setSyncStreamError(null);
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
