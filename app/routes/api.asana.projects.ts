import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCachedSettings } from "../lib/shop-cache.server";
import { getValidAsanaAccessToken, fetchProjects } from "../lib/asana.server";

// Called once when the Integrations page mounts with Asana already connected,
// or after a workspace switch — shared across all three event rows since
// they all pick from the same workspace's project list.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const settings = await getCachedSettings(shop);
  if (!settings?.asanaWorkspaceGid) return { projects: [] };

  const accessToken = await getValidAsanaAccessToken(shop);
  if (!accessToken) return { projects: [] };

  try {
    const projects = await fetchProjects(accessToken, settings.asanaWorkspaceGid);
    return { projects };
  } catch (err) {
    console.error("[Asana] fetchProjects failed:", err);
    return { projects: [] };
  }
};
