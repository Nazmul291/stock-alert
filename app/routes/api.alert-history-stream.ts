import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { loadAlerts } from "../lib/alert-history-data.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const typeFilter = url.searchParams.get("type") ?? "all";
  const productSearch = url.searchParams.get("product") ?? "";

  return authenticatedSingleShotJSON(request, ({ shop }) => loadAlerts({ shop, page, typeFilter, productSearch }));
};
