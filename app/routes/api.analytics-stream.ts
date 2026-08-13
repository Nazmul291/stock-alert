import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { loadAnalyticsData } from "../lib/analytics-data.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  authenticatedSingleShotJSON(request, ({ shop }) => loadAnalyticsData(shop));
