import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getValidAsanaAccessToken, fetchWorkspaces } from "../lib/asana.server";

// Called on demand (not persisted) when the merchant opens "Change workspace"
// in the Integrations UI — only the currently *selected* workspace is stored
// on StoreSettings, the full list is always fetched live.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const accessToken = await getValidAsanaAccessToken(session.shop);
  if (!accessToken) return { workspaces: [] };

  try {
    const workspaces = await fetchWorkspaces(accessToken);
    return { workspaces };
  } catch (err) {
    console.error("[Asana] fetchWorkspaces failed:", err);
    return { workspaces: [] };
  }
};
