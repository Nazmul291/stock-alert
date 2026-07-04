import type { LoaderFunctionArgs } from "react-router";
import { singleShotSSE } from "../lib/sse.server";

// Confirms whether "/" was loaded embedded inside the Shopify admin iframe,
// mirroring the exact check _index/route.tsx's loader already did — moved
// here so the landing page can render a skeleton first and let the redirect
// to /app happen only once the server has confirmed it, instead of a
// server-side throw redirect() before any HTML is sent.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const embedded = ["shop", "host", "embedded", "appLoadId"].some((key) => url.searchParams.has(key));

  return singleShotSSE(async () => ({ embedded }));
};
