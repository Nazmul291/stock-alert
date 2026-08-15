import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

// Day-bucketed counterpart to velocity.server.ts's calcSalesVelocity, which
// only ever produces one flat 30-day total per product (it never requests
// order dates at all). This keeps the date so the Demand Forecast chart can
// show a real per-day history instead of one blended average.
//
// Order search has no per-product filter field server-side (same limitation
// calcSalesVelocity works around) — every order in the window is paged
// through and its line items are filtered to the one requested product
// client-side. Acceptable here because this is gated to Enterprise and
// fetched lazily (once, on demand, from the product-detail page), not run
// shop-wide in the daily velocity cron.

type OrdersWithDatesResponse = {
  data?: {
    orders: {
      edges: Array<{
        node: {
          createdAt: string;
          lineItems: {
            edges: Array<{ node: { quantity: number; product: { legacyResourceId: string } | null } }>;
          } | null;
        };
      }>;
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
    };
  };
  extensions?: { cost?: { throttleStatus?: { currentlyAvailable: number; restoreRate: number } } };
};

const ORDERS_WITH_DATES_QUERY = `
  query GetOrderItemsWithDates($query: String!, $after: String) {
    orders(first: 250, query: $query, after: $after) {
      edges {
        node {
          createdAt
          lineItems(first: 100) {
            edges {
              node {
                quantity
                product { legacyResourceId }
              }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const MAX_ORDERS = 2000;

export type DailySales = { date: string; units: number };

/**
 * Fetches `windowDays` of order history and returns one entry per day (in
 * UTC, oldest first, ending today) with units sold of `productId` that day.
 * Zero-sales days are included (gap-filled), not skipped, so the caller
 * always gets a contiguous series to plot.
 */
export async function getProductSalesHistory(
  admin: AdminApiContext,
  productId: string,
  windowDays = 30,
): Promise<DailySales[]> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const queryStr = `created_at:>'${since.toISOString()}' -status:cancelled`;

  const unitsByDate = new Map<string, number>();
  let cursor: string | null = null;
  let total = 0;

  while (total < MAX_ORDERS) {
    const res = await admin.graphql(ORDERS_WITH_DATES_QUERY, {
      variables: { query: queryStr, ...(cursor ? { after: cursor } : {}) },
    });
    const json: OrdersWithDatesResponse = await res.json();

    const throttle = json.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < throttle.restoreRate * 1.5) {
      const needed = throttle.restoreRate * 1.5 - throttle.currentlyAvailable;
      await new Promise((r) => setTimeout(r, Math.ceil((needed / throttle.restoreRate) * 1000)));
    }

    const page = json.data?.orders;
    if (!page) break;

    for (const { node: order } of page.edges) {
      const date = order.createdAt.slice(0, 10); // ISO8601 UTC → "YYYY-MM-DD"
      for (const { node: item } of order.lineItems?.edges ?? []) {
        if (item.product?.legacyResourceId === productId && item.quantity > 0) {
          unitsByDate.set(date, (unitsByDate.get(date) ?? 0) + item.quantity);
        }
      }
      total++;
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  return gapFillDailySales(unitsByDate, windowDays);
}

// Exported separately so the bucketing/gap-fill logic can be unit-tested
// with a fake unitsByDate map, without a live Shopify connection.
export function gapFillDailySales(unitsByDate: Map<string, number>, windowDays: number): DailySales[] {
  const days: DailySales[] = [];
  const today = new Date();
  for (let i = windowDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    days.push({ date, units: unitsByDate.get(date) ?? 0 });
  }
  return days;
}

export type ForecastPoint = { date: string; stockLevel: number };

// Turns a day-bucketed sales history into two curves for the Demand
// Forecast chart. Pure — no Shopify/Prisma calls — so it's unit-testable
// with hand-built inputs.
//
// `history` is a reconstruction, not ground truth: there is no historical
// stock-snapshot table, so it's derived backward from today's known
// currentQuantity using each day's units sold — stockOnDay(d) = stock on
// day d+1 plus whatever sold on day d+1 (walking backward, "undoing" each
// day's sales one at a time). A restock inside the window isn't visible to
// this math, so days before an undetected restock will read higher than
// they actually were — the caller must label this "Estimated," not exact.
//
// `forecast` is a forward linear-depletion projection from today, capped at
// `maxForecastDays` so a near-zero-velocity product doesn't produce an
// absurdly long axis. With no usable sales rate, it degrades to a single
// flat point at today rather than dividing by zero or guessing.
export function buildForecastCurves(
  currentQuantity: number,
  avgDailySales: number | null,
  salesHistory: DailySales[],
  maxForecastDays = 60,
): { history: ForecastPoint[]; forecast: ForecastPoint[]; stockOutDate: string | null } {
  const history: ForecastPoint[] = [];
  if (salesHistory.length > 0) {
    const lastIndex = salesHistory.length - 1;
    let runningLevel = currentQuantity;
    history[lastIndex] = { date: salesHistory[lastIndex].date, stockLevel: Math.max(0, runningLevel) };
    for (let i = lastIndex - 1; i >= 0; i--) {
      runningLevel += salesHistory[i + 1].units;
      history[i] = { date: salesHistory[i].date, stockLevel: Math.max(0, runningLevel) };
    }
  }

  const todayDate = salesHistory.length > 0 ? salesHistory[salesHistory.length - 1].date : new Date().toISOString().slice(0, 10);
  const today = new Date(`${todayDate}T00:00:00Z`);

  const forecast: ForecastPoint[] = [];
  let stockOutDate: string | null = null;
  if (avgDailySales && avgDailySales > 0) {
    for (let day = 0; day <= maxForecastDays; day++) {
      const level = Math.max(0, currentQuantity - avgDailySales * day);
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + day);
      const date = d.toISOString().slice(0, 10);
      forecast.push({ date, stockLevel: level });
      if (level <= 0) {
        stockOutDate = date;
        break; // no need to keep projecting flat zeros
      }
    }
  } else {
    forecast.push({ date: todayDate, stockLevel: currentQuantity });
  }

  return { history, forecast, stockOutDate };
}
