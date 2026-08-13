import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { loadDashboardData } from "../lib/dashboard-data.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  authenticatedSingleShotJSON(request, ({ shop }) => loadDashboardData(shop));
