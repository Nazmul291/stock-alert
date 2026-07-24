import type { LoaderFunctionArgs } from "react-router";
import { resolveSseToken } from "../lib/sse-token.server";
import { singleShotSSE } from "../lib/sse.server";
import { unauthenticated } from "../shopify.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { getProductDetail } from "../lib/product-detail.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const productId = url.searchParams.get("productId");

  const shop = token ? await resolveSseToken(token) : null;
  if (!shop || !productId) {
    return singleShotSSE(async () => {
      throw new Error("Session expired — please reload the page.");
    });
  }

  return singleShotSSE(async () => {
    const [{ admin }, storeSession] = await Promise.all([
      unauthenticated.admin(shop),
      getCachedSession(shop),
    ]);
    const plan = storeSession?.plan ?? "basic";
    const detail = await getProductDetail(shop, productId, plan, admin);
    if (!detail) throw new Error("Product not found.");
    return detail;
  });
};
