import { useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { AlertsData } from "../lib/alert-history-data.server";
import { useSSEData } from "../hooks/use-sse-data";
import { useAlertHistoryStore } from "../stores/alert-history-store";
import { AlertHistoryToolbar } from "../components/alert-history/AlertHistoryToolbar";
import { AlertsTable, AlertsTableSkeleton } from "../components/alert-history/AlertsTable";

// Filters come straight from the URL — available immediately, no DB needed —
// so they're returned synchronously. The actual alert rows load entirely in
// the background via api.alert-history-stream.ts (same filter params, passed
// through the query string) and stream to the client over SSE once ready.
// loadAlerts itself lives in app/lib/alert-history-data.server.ts, not here —
// see app._index.tsx's loader comment for why a plain exported function can't
// stay in a route file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const typeFilter = url.searchParams.get("type") ?? "all";
  const productSearch = url.searchParams.get("product") ?? "";
  const token = await mintSseToken(shop);

  return { page, typeFilter, productSearch, token };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "delete_one") {
    const id = form.get("id") as string;
    if (id) await prisma.alertHistory.deleteMany({ where: { id, shop } });
    return { deleted: id };
  }

  if (intent === "clear_all") {
    await prisma.alertHistory.deleteMany({ where: { shop } });
    return { cleared: true };
  }

  return { error: "Unknown intent" };
};

export default function AlertHistoryPage() {
  const { typeFilter, productSearch, page, token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<AlertsData>(
    `/api/alert-history-stream?token=${encodeURIComponent(token)}&page=${page}&type=${encodeURIComponent(typeFilter)}&product=${encodeURIComponent(productSearch)}`,
  );

  const setLoaderData = useAlertHistoryStore((s) => s.setLoaderData);
  const setSSEState = useAlertHistoryStore((s) => s.setSSEState);
  useEffect(() => { setLoaderData({ page, typeFilter, productSearch }); }, [page, typeFilter, productSearch, setLoaderData]);
  useEffect(() => { setSSEState({ data, error, retry }); }, [data, error, retry, setSSEState]);

  const storeData = useAlertHistoryStore((s) => s.data);
  const storeError = useAlertHistoryStore((s) => s.error);

  return (
    <s-page heading="Alert History" sub-heading="Track every low-stock and back-in-stock alert">
      <s-button slot="primary-action" variant="primary" href="/app">Back to Dashboard</s-button>

      <s-section heading="">
        <AlertHistoryToolbar />

        {storeError ? (
          <SSEErrorRetry message={storeError} onRetry={retry} />
        ) : storeData ? (
          <AlertsTable />
        ) : (
          <AlertsTableSkeleton />
        )}
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
