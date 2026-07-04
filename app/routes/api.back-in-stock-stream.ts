import type { LoaderFunctionArgs } from "react-router";
import { resolveSseToken } from "../lib/sse-token.server";
import { singleShotSSE } from "../lib/sse.server";
import { loadBackInStockData } from "../lib/back-in-stock-data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);

  const shop = token ? await resolveSseToken(token) : null;
  if (!shop) {
    return singleShotSSE(async () => {
      throw new Error("Session expired — please reload the page.");
    });
  }

  return singleShotSSE(() => loadBackInStockData({ shop, page }));
};
