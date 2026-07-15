import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { mintSseToken } from "../lib/sse-token.server";

// Mints a longer-lived token (vs. the 60s default used for one-shot page
// loads) for api.live-stream.ts's persistent connection. Authenticated the
// normal way (session cookie via authenticate.admin) rather than reusing a
// page loader's token, so the client can re-mint on every reconnect attempt
// without needing a full page/loader round trip.
const LIVE_STREAM_TOKEN_TTL_SECONDS = 15 * 60;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const token = await mintSseToken(session.shop, LIVE_STREAM_TOKEN_TTL_SECONDS);
  return { token };
};
