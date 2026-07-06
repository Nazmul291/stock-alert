import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getValidAsanaAccessToken, fetchSections } from "../lib/asana.server";

// Called whenever any event row's project selection changes — the client
// caches results by projectGid so flipping back to an already-seen project
// doesn't refetch. An empty list means the project has no sections, so the
// UI skips the "Group" dropdown entirely for it.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const projectGid = new URL(request.url).searchParams.get("projectGid");
  if (!projectGid) return { sections: [] };

  const accessToken = await getValidAsanaAccessToken(session.shop);
  if (!accessToken) return { sections: [] };

  try {
    const sections = await fetchSections(accessToken, projectGid);
    return { sections };
  } catch (err) {
    console.error("[Asana] fetchSections failed:", err);
    return { sections: [] };
  }
};
