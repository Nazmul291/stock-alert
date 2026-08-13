import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { getProductDetail } from "../lib/product-detail.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  return authenticatedSingleShotJSON(request, async ({ admin, shop }) => {
    if (!productId) throw new Error("Missing product id.");
    const storeSession = await getCachedSession(shop);
    const plan = storeSession?.plan ?? "basic";
    const detail = await getProductDetail(shop, productId, plan, admin);
    if (!detail) throw new Error("Product not found.");
    return detail;
  });
};
