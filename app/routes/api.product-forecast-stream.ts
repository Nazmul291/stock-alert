import type { LoaderFunctionArgs } from "react-router";
import { authenticatedSingleShotJSON } from "../lib/sse.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import prisma from "../db.server";
import { getProductSalesHistory, buildForecastCurves } from "../lib/sales-history.server";

const HISTORY_DAYS = 30;

// Single-shot, modeled on api.product-detail-stream.ts — fetched lazily by
// DemandForecastSection only once mounted (Enterprise plans only), so the
// extra Orders round-trip never blocks the main product-detail page load.
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");

  return authenticatedSingleShotJSON(request, async ({ admin, shop }) => {
    if (!productId) throw new Error("Missing product id.");

    const storeSession = await getCachedSession(shop);
    const plan = storeSession?.plan ?? "basic";
    if (!canUseFeature(plan, "demandForecast")) {
      throw new Error("Demand forecasting is an Enterprise plan feature.");
    }

    const rows = await prisma.inventoryTracking.findMany({
      where: { shop, productId: BigInt(productId) },
      select: { currentQuantity: true, avgDailySales: true, manualDailySales: true },
    });
    if (rows.length === 0) throw new Error("Product not found.");

    // Every variant row of a product carries an identical product-level
    // avgDailySales (calcSalesVelocity computes it per product, then
    // refreshShopVelocity copies that same value onto every variant row —
    // see velocity.server.ts) — take one representative value rather than
    // summing across rows, which would multiply it by the variant count.
    const currentQuantity = rows.reduce((sum, r) => sum + r.currentQuantity, 0);
    const avgDailySales = rows[0].manualDailySales ?? rows[0].avgDailySales ?? null;

    const salesHistory = await getProductSalesHistory(admin, productId, HISTORY_DAYS);
    const { history, forecast, stockOutDate } = buildForecastCurves(currentQuantity, avgDailySales, salesHistory);

    return { history, forecast, stockOutDate, currentQuantity, avgDailySales };
  });
};
