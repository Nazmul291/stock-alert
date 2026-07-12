import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { useSSEData } from "../hooks/use-sse-data";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { mintSseToken } from "../lib/sse-token.server";
import type { DashboardData } from "../lib/dashboard-data.server";
import { useAppGateStore } from "../stores/app-gate-store";
import { SSEErrorRetry } from "../components/Skeleton";
import { DashboardSkeleton } from "../components/dashboard/DashboardSkeleton";
import { SetupChecklist } from "../components/dashboard/SetupChecklist";
import { InventoryOverviewSection } from "../components/dashboard/InventoryOverviewSection";
import { StockOutSoonBanner } from "../components/dashboard/StockOutSoonBanner";
import { ProductsAtRiskSection } from "../components/dashboard/ProductsAtRiskSection";
import { RecentAlertsSection } from "../components/dashboard/RecentAlertsSection";
import { DashboardSyncButton } from "../components/dashboard/DashboardSyncButton";

// Only the auth check blocks the response — dashboard data is fetched entirely
// in the background by api.dashboard-stream.ts, identified by a short-lived
// token (EventSource can't carry the session-token auth header), and pushed to
// the client over SSE the moment it's ready. loadDashboardData itself lives in
// app/lib/dashboard-data.server.ts (not here) — React Router only strips
// server-only code from `loader`/`action`/`headers`/`middleware`, so any other
// export from a route file (like a plain helper function) gets pulled into the
// client bundle too, dragging in server-only modules like db.server with it.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const token = await mintSseToken(shop);
  return { shop, token };
};

export default function Dashboard() {
  const { shop, token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<DashboardData>(
    `/api/dashboard-stream?token=${encodeURIComponent(token)}`,
  );

  // app.tsx's gate check runs in parallel and may still decide to bounce this
  // merchant to onboarding/billing. Hold the skeleton while appStatus is
  // "loading" or "redirect", instead of flashing full dashboard content right
  // before the redirect fires — only "ready" means it's safe to render.
  const appStatus = useAppGateStore((s) => s.appStatus);
  const showContent = !!data && appStatus === "ready";

  return (
    <s-page heading="Dashboard" sub-heading="Monitor your inventory and alerts">
      <s-button slot="primary-action" variant="primary" href="/app/products">
        Manage Products
      </s-button>

      {error ? (
        <SSEErrorRetry message={error} onRetry={retry} />
      ) : showContent ? (
        <DashboardContent shop={shop} data={data!} />
      ) : (
        <DashboardSkeleton />
      )}
    </s-page>
  );
}

function DashboardContent({ shop, data }: { shop: string; data: DashboardData }) {
  const {
    plan, stats, setupProgress, progressPct, syncRunning, lastSyncCompletedAt, lastSyncCount,
    lastWebhookAt, recentAlerts, notificationEmail, alertsToday, spark7, atRiskProducts, stockOutSoonCount,
  } = data;

  const syncFetcher = useFetcher<{ status?: string; error?: string }>();
  const { syncPct, syncStreamError, clearError, openStream } = useSyncStream(shop, syncRunning);

  useEffect(() => {
    if (syncFetcher.data?.status === "started") openStream();
  }, [syncFetcher.data, openStream]);

  const syncActionError = syncPct === null && syncFetcher.state === "idle" ? (syncFetcher.data?.error ?? null) : null;
  const syncError = syncStreamError ?? syncActionError;

  return (
    <>
      {/* Setup checklist */}
      {progressPct < 100 && (
        <SetupChecklist
          progress={setupProgress}
          progressPct={progressPct}
          syncPct={syncPct}
          syncSubmitting={syncFetcher.state !== "idle"}
          onSync={() => {
            if (syncPct === null && syncFetcher.state === "idle")
              syncFetcher.submit({ intent: "sync" }, { method: "post", action: "/app/products" });
          }}
        />
      )}

      <InventoryOverviewSection
        plan={plan}
        stats={stats}
        alertsToday={alertsToday}
        spark7={spark7}
        lastWebhookAt={lastWebhookAt}
        lastSyncCompletedAt={lastSyncCompletedAt}
        lastSyncCount={lastSyncCount}
      />

      {stockOutSoonCount > 0 && <StockOutSoonBanner count={stockOutSoonCount} />}

      {atRiskProducts.length > 0 && (
        <ProductsAtRiskSection products={atRiskProducts} />
      )}

      <RecentAlertsSection alerts={recentAlerts} />

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
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
