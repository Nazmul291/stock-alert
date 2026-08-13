import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { loadIntegrationsData } from "../lib/integrations-data.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  authenticatedSingleShotJSON(request, ({ shop }) => loadIntegrationsData(shop));
