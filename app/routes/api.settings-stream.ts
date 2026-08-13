import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { loadSettingsData } from "../lib/settings-data.server";

export const loader = ({ request }: LoaderFunctionArgs) =>
  authenticatedSingleShotJSON(request, ({ shop }) => loadSettingsData(shop));
