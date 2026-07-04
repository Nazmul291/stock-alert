import type { LoaderFunctionArgs } from "react-router";
import { resolveSseToken } from "../lib/sse-token.server";
import { singleShotSSE } from "../lib/sse.server";
import { unauthenticated } from "../shopify.server";
import { loadProductsData } from "../lib/products-data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const search = url.searchParams.get("search") ?? "";
  const after = url.searchParams.get("after") || null;
  const filter = url.searchParams.get("filter") ?? "all";

  const shop = token ? await resolveSseToken(token) : null;
  if (!shop) {
    return singleShotSSE(async () => {
      throw new Error("Session expired — please reload the page.");
    });
  }

  return singleShotSSE(async () => {
    const { admin } = await unauthenticated.admin(shop);
    return loadProductsData({ admin, shop, search, after, filter });
  });
};
