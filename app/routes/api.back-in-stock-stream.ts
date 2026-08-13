import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { loadBackInStockData } from "../lib/back-in-stock-data.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);

  return authenticatedSingleShotJSON(request, ({ shop }) => loadBackInStockData({ shop, page }));
};
