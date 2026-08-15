import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { previewPurchaseOrders, searchTrackedProducts, withLiveUnitCost, getShopLocations } from "../lib/purchase-order.server";
import prisma from "../db.server";

// Backs the general Purchase Orders page's Create Purchase Order modal —
// deliberately its own resource route (no default export / UI component),
// not query params on app.purchase-orders._index.tsx's own loader. A plain
// fetch() to a route that *does* have a component gets treated as a normal
// document request and returns full rendered HTML instead of data (that's
// what a raw fetch() to the page route was doing before this route existed
// — "Unexpected token '<'" trying to JSON.parse the HTML). Routes with no
// component always just return whatever the loader returns, however
// they're requested, which is what makes them safe for both useFetcher()
// and useSSEData's plain fetch() alike.
export const loader = ({ request }: LoaderFunctionArgs) =>
  authenticatedSingleShotJSON(request, async ({ admin, shop }) => {
    const url = new URL(request.url);
    const intent = url.searchParams.get("intent");

    // Suppliers + shop locations for the Create Purchase Order modal —
    // fetched lazily on this route only when the modal actually opens
    // (e.g. from the Products page's toolbar button), rather than on every
    // page's own loader. Products page loads product data in the
    // background already (api.products-stream.ts) and stays fast for
    // merchants who never touch purchase orders — this keeps that true.
    if (intent === "context") {
      const [suppliers, locations] = await Promise.all([
        prisma.supplier.findMany({ where: { shop }, select: { id: true, name: true, paymentTerms: true }, orderBy: { name: "asc" } }),
        getShopLocations(admin).catch(() => []),
      ]);
      return { suppliers, locations };
    }

    if (intent === "search_products") {
      const search = url.searchParams.get("search") ?? "";
      const products = await searchTrackedProducts(shop, { search });
      return { products: await withLiveUnitCost(admin, products) };
    }

    // Default: suggested_lines
    const supplierId = url.searchParams.get("supplierId");
    const preview = await previewPurchaseOrders(shop, supplierId ? [supplierId] : undefined);
    const withLiveCosts = await Promise.all(
      preview.map(async (group) => ({ ...group, lines: await withLiveUnitCost(admin, group.lines) })),
    );
    return { preview: withLiveCosts };
  });
