import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { loadProductsData } from "../lib/products-data.server";

export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const after = url.searchParams.get("after") || null;
  const filter = url.searchParams.get("filter") ?? "all";

  return authenticatedSingleShotJSON(request, ({ admin, shop }) =>
    loadProductsData({ admin, shop, search, after, filter }),
  );
};
