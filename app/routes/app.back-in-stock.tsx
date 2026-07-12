import { useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { SSEErrorRetry } from "../components/Skeleton";
import { mintSseToken } from "../lib/sse-token.server";
import type { BackInStockData } from "../lib/back-in-stock-data.server";
import { useSSEData } from "../hooks/use-sse-data";
import { useBackInStockStore } from "../stores/back-in-stock-store";
import { BackInStockStatCards } from "../components/back-in-stock/BackInStockStatCards";
import { BackInStockProductGroups } from "../components/back-in-stock/BackInStockProductGroups";
import { BackInStockSubscriberList } from "../components/back-in-stock/BackInStockSubscriberList";

// `page` comes straight from the URL — available immediately. Everything else
// loads entirely in the background via api.back-in-stock-stream.ts and streams
// to the client over SSE once ready. loadBackInStockData itself lives in
// app/lib/back-in-stock-data.server.ts, not here — see app._index.tsx's loader
// comment for why a plain exported function can't stay in a route file.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const token = await mintSseToken(shop);

  return { page, token };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "delete_subscriber") {
    const id = form.get("id") as string;
    if (id) await prisma.backInStockSubscriber.deleteMany({ where: { id, shop } });
    return { deleted: id };
  }

  if (intent === "clear_product") {
    const productId = form.get("productId") as string;
    if (productId) {
      await prisma.backInStockSubscriber.deleteMany({
        where: { shop, productId: BigInt(productId) },
      });
    }
    return { cleared: true };
  }

  return null;
};

export default function BackInStockPage() {
  const { page, token } = useLoaderData<typeof loader>();
  const { data, error, retry } = useSSEData<BackInStockData>(
    `/api/back-in-stock-stream?token=${encodeURIComponent(token)}&page=${page}`,
  );

  const setLoaderData = useBackInStockStore((s) => s.setLoaderData);
  const setSSEState = useBackInStockStore((s) => s.setSSEState);
  useEffect(() => { setLoaderData({ page }); }, [page, setLoaderData]);
  useEffect(() => { setSSEState({ data, error, retry }); }, [data, error, retry, setSSEState]);

  const storeError = useBackInStockStore((s) => s.error);

  return (
    <s-page heading="Back in Stock" sub-heading="Manage customers waiting for restocked products">
      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry} />
      ) : (
        <BackInStockContent />
      )}
    </s-page>
  );
}

// Always renders the real layout — descendants read `loading` off the store
// themselves and apply the shared `.skeleton-text` class to just their
// dynamic value nodes, so there's a single markup tree for both states
// instead of a separate skeleton component to keep in sync.
function BackInStockContent() {
  const loading = useBackInStockStore((s) => s.data === null);
  // Held back until data confirms there actually are product groups to
  // show, rather than reserving space on every load.
  const hasProductGroups = useBackInStockStore((s) => (s.data?.productGroups.length ?? 0) > 0);

  return (
    <>
      <BackInStockStatCards />

      {(!loading && hasProductGroups) && <BackInStockProductGroups />}

      <div style={{ marginTop: 24 }}>
        <BackInStockSubscriberList />
      </div>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
