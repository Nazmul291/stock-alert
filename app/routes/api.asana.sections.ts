import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getValidAsanaAccessToken, fetchSections } from "../lib/asana.server";

// Called whenever any event row's project selection changes — the client
// caches results by projectGid so flipping back to an already-seen project
// doesn't refetch. An empty list with no `error` means the project genuinely
// has no sections, so the UI skips the "Group" dropdown entirely for it —
// but a failed fetch (expired token, revoked scope, etc.) also produces an
// empty list, which is indistinguishable from "no sections" unless the
// reason comes along with it, so callers should surface `error` when present
// rather than silently treating it as "no sections".
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const projectGid = new URL(request.url).searchParams.get("projectGid");
  if (!projectGid) return { sections: [] };

  const accessToken = await getValidAsanaAccessToken(session.shop);
  if (!accessToken) return { sections: [], error: "Asana isn't connected (or the connection expired) — reconnect it above." };

  try {
    const sections = await fetchSections(accessToken, projectGid);
    return { sections };
  } catch (err) {
    console.error("[Asana] fetchSections failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return { sections: [], error: `Couldn't load groups: ${message}` };
  }
};
