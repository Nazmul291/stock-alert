import type { LoaderFunctionArgs } from "react-router";
import { resolveSseToken } from "../lib/sse-token.server";
import { singleShotSSE } from "../lib/sse.server";
import { loadAnalyticsData } from "../lib/analytics-data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  const shop = token ? await resolveSseToken(token) : null;
  if (!shop) {
    return singleShotSSE(async () => {
      throw new Error("Session expired — please reload the page.");
    });
  }

  return singleShotSSE(() => loadAnalyticsData(shop));
};
