import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useSyncStream } from "../hooks/use-sync-stream";
import { useCachedSSEData } from "../hooks/use-cached-sse-data";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { mintSseToken } from "../lib/sse-token.server";
import type { DashboardData } from "../lib/dashboard-data.server";
import { useAppGateStore } from "../stores/app-gate-store";
import { useDashboardStore } from "../stores/dashboard-store";
import { SSEErrorRetry } from "../components/Skeleton";
import { SetupChecklist } from "../components/dashboard/SetupChecklist";
import { InventoryOverviewSection } from "../components/dashboard/InventoryOverviewSection";
import { StockOutSoonBanner } from "../components/dashboard/StockOutSoonBanner";
import { ReadyForReorderBanner } from "../components/dashboard/ReadyForReorderBanner";
import { canUseFeature, getPlanLimits } from "../lib/plan-limits";
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

  const setLoaderData = useDashboardStore((s) => s.setLoaderData);
  useEffect(() => { setLoaderData({ shop }); }, [shop, setLoaderData]);

  const cachedData = useDashboardStore((s) => s.data);
  const cachedKey = useDashboardStore((s) => s.lastKey);
  const lastFetchedAt = useDashboardStore((s) => s.lastFetchedAt);
  const setSSEState = useDashboardStore((s) => s.setSSEState);
  useCachedSSEData<DashboardData>(
    "",
    () => `/api/dashboard-stream?token=${encodeURIComponent(token)}`,
    "dashboard",
    cachedData,
    cachedKey,
    lastFetchedAt,
    setSSEState,
  );

  const retry = useDashboardStore((s) => s.retry);
  const storeError = useDashboardStore((s) => s.error);

  return (
    <s-page heading="Dashboard" sub-heading="Monitor your inventory and alerts">
      {/* suppressHydrationWarning: s-button is a Shopify Polaris web
          component that injects its own `style` attribute during server
          rendering, outside anything declared in this JSX — React's
          hydration diff otherwise flags that as a false-positive mismatch.
          The generated JSX type for this custom element doesn't extend
          React's base DOM attributes (so it doesn't know about this prop),
          even though React honors it on any element at runtime. */}
      {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
      <s-button slot="primary-action" variant="primary" href="/app/products" suppressHydrationWarning>
        Manage Products
      </s-button>

      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry ?? (() => {})} />
      ) : (
        <DashboardContent />
      )}
    </s-page>
  );
}

// Always renders the real layout — descendants read `loading` off the store
// themselves and apply the shared `.skeleton-text` class to just their
// dynamic value nodes, so there's a single markup tree for both states
// instead of a separate skeleton component to keep in sync.
function DashboardContent() {
  const shop = useDashboardStore((s) => s.shop);
  const data = useDashboardStore((s) => s.data);
  // app.tsx's gate check runs in parallel and may still decide to bounce this
  // merchant to onboarding/billing. Treat the page as still loading while
  // appStatus is "loading" or "redirect", instead of flashing full dashboard
  // content right before the redirect fires — only "ready" means it's safe
  // to treat data as final.
  const appStatus = useAppGateStore((s) => s.appStatus);
  // Gate on the STORE's data, not the local `data` from useSSEData in the
  // parent — the setSSEState effect hasn't committed yet in the same render
  // where that local value first turns non-null, so this component would
  // otherwise render against a stale/null value for one commit. See
  // dashboard-store.ts.
  const loading = !data || appStatus !== "ready";

  const syncFetcher = useFetcher<{ status?: string; error?: string }>();
  const { syncPct, syncStreamError, clearError, openStream } = useSyncStream(shop ?? "", data?.syncRunning ?? false);

  useEffect(() => {
    if (syncFetcher.data?.status === "started") openStream();
  }, [syncFetcher.data, openStream]);

  const plan = data?.plan ?? "basic";
  const progressPct = data?.progressPct ?? 0;
  const notificationEmail = data?.notificationEmail ?? null;
  const atRiskProducts = data?.atRiskProducts ?? [];
  const stockOutSoonCount = data?.stockOutSoonCount ?? 0;
  const readyForReorderCount = data?.readyForReorderCount ?? 0;
  const canManagePurchaseOrders = canUseFeature(plan, "purchaseOrders");
  const planLimits = getPlanLimits(plan);

  const syncActionError = syncPct === null && syncFetcher.state === "idle" ? (syncFetcher.data?.error ?? null) : null;
  const syncError = syncStreamError ?? syncActionError;

  return (
    <>
      {/* Setup checklist — held back until data confirms setup is actually
          incomplete, rather than reserving space on every load; most
          merchants complete setup once and shouldn't see this flash back in
          on every reload. */}
      {(!loading && progressPct < 100) && (
        <SetupChecklist
          syncPct={syncPct}
          syncSubmitting={syncFetcher.state !== "idle"}
          onSync={() => {
            if (syncPct === null && syncFetcher.state === "idle")
              syncFetcher.submit({ intent: "sync" }, { method: "post", action: "/app/products" });
          }}
        />
      )}

      <InventoryOverviewSection />

      {/* Held back until data confirms it's actually needed, same reasoning
          as the setup checklist above — most loads won't need this, so
          don't reserve space for it by default. */}
      {(!loading && stockOutSoonCount > 0) && <StockOutSoonBanner />}

      {(!loading && canManagePurchaseOrders && readyForReorderCount > 0) && <ReadyForReorderBanner />}

      {/* Unlike the two above, this one renders during loading too (showing
          its own internal skeleton — see ProductsAtRiskSection.tsx's
          PLACEHOLDER_ROWS) and only disappears once data confirms there's
          genuinely nothing at risk, matching RecentAlertsSection's
          always-mounted strategy below. */}
      {(loading || atRiskProducts.length > 0) && <ProductsAtRiskSection />}

      <RecentAlertsSection />

      {/* Store info */}
      <s-section heading="Store Information" slot="aside">
        <s-paragraph><strong>Shop:</strong> {shop}</s-paragraph>
        <s-paragraph>
          <strong>Plan:</strong>{" "}
          <span
            className={loading ? "skeleton-text" : undefined}
            style={{
              background: plan === "enterprise" ? "#ede9fe" : plan === "pro" ? "#d1fae5" : "#dbeafe",
              color: plan === "enterprise" ? "#5b21b6" : plan === "pro" ? "#065f46" : "#1e40af",
              padding: "1px 8px", borderRadius: 12, fontSize: 12,
            }}
          >
            {planLimits.name}
          </span>
        </s-paragraph>
        {(loading || notificationEmail) && (
          <s-paragraph>
            <strong>Alert Email:</strong>{" "}
            <span className={loading ? "skeleton-text" : undefined}>{notificationEmail || "name@example.com"}</span>
          </s-paragraph>
        )}
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
          {/* suppressHydrationWarning on these s-button elements: see the comment above the "Manage Products" button. */}
          {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
          <s-button href="/app/settings" suppressHydrationWarning>Configure Settings</s-button>
          {plan !== "enterprise" && (
            // @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type
            <s-button href="/app/billing" suppressHydrationWarning>{plan === "pro" ? "Upgrade to Enterprise" : "Upgrade Plan"}</s-button>
          )}
        </s-stack>
      </s-section>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
