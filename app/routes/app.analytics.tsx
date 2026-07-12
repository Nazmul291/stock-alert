import { useEffect } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { SkeletonBlock, SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { AnalyticsData } from "../lib/analytics-data.server";
import { useSSEData } from "../hooks/use-sse-data";
import { useAnalyticsStore } from "../stores/analytics-store";
import { AnalyticsStatCards, AnalyticsStatCardsSkeleton } from "../components/analytics/AnalyticsStatCards";
import { AlertTypeBreakdown, AlertTypeBreakdownSkeleton } from "../components/analytics/AlertTypeBreakdown";
import { ChannelBreakdown, ChannelBreakdownSkeleton } from "../components/analytics/ChannelBreakdown";
import { DailyBarChart } from "../components/analytics/DailyBarChart";
import { TopProductsChart } from "../components/analytics/TopProductsChart";
import { StockHealthBar } from "../components/analytics/StockHealthBar";

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

  const setSSEState = useAnalyticsStore((s) => s.setSSEState);
  useEffect(() => { setSSEState({ data, error, retry }); }, [data, error, retry, setSSEState]);

  // Gate on the store, not the local `data`/`error` above — see the rule
  // established in dashboard-store.ts.
  const storeData = useAnalyticsStore((s) => s.data);
  const storeError = useAnalyticsStore((s) => s.error);

  return (
    <s-page heading="Analytics" sub-heading="Alert trends and inventory health over the last 30 days">
      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry} />
      ) : storeData ? (
        <AnalyticsContent />
      ) : (
        <AnalyticsSkeleton />
      )}
    </s-page>
  );
}

function AnalyticsContent() {
  const totalThisMonth = useAnalyticsStore((s) => s.data!.totalThisMonth);
  const topProducts = useAnalyticsStore((s) => s.data!.topProducts);

  return (
    <>
      {/* Summary stat cards */}
      <AnalyticsStatCards />

      {/* Row 2: Type breakdown + Channel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <s-section heading="Alert Types">
          <AlertTypeBreakdown />
        </s-section>
        <s-section heading="Notification Channels">
          <ChannelBreakdown />
        </s-section>
      </div>

      {/* Daily volume chart */}
      <s-section heading="Daily Alert Volume — Last 30 Days">
        <DailyBarChart />
      </s-section>

      {/* Top products */}
      {topProducts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <s-section heading="Most Alerted Products">
            <TopProductsChart />
          </s-section>
        </div>
      )}

      {/* Stock health */}
      <div style={{ marginTop: 16 }}>
        <s-section heading="Current Stock Health">
          <StockHealthBar />
        </s-section>
      </div>

      {totalThisMonth === 0 && (
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
      <AnalyticsStatCardsSkeleton />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <s-section heading="Alert Types"><AlertTypeBreakdownSkeleton /></s-section>
        <s-section heading="Notification Channels"><ChannelBreakdownSkeleton /></s-section>
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

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
