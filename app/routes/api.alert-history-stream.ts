import type { LoaderFunctionArgs } from "react-router";
import { resolveSseToken } from "../lib/sse-token.server";
import { singleShotSSE } from "../lib/sse.server";
import { loadAlerts } from "../lib/alert-history-data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const typeFilter = url.searchParams.get("type") ?? "all";
  const productSearch = url.searchParams.get("product") ?? "";

  const shop = token ? await resolveSseToken(token) : null;
  if (!shop) {
    return singleShotSSE(async () => {
      throw new Error("Session expired — please reload the page.");
    });
  }

  return singleShotSSE(() => loadAlerts({ shop, page, typeFilter, productSearch }));
};
