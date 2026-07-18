import prisma from "../db.server";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

type OrdersQueryResponse = {
  data?: {
    orders: {
      edges: Array<{
        node: {
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

const ORDERS_QUERY = `
  query GetOrderItems($query: String!, $after: String) {
    orders(first: 250, query: $query, after: $after) {
      edges {
        node {
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

const WINDOW_DAYS = 30;
const MAX_ORDERS = 2000;

/**
 * Fetches the last 30 days of orders from Shopify and returns a map of
 * productId → average units sold per day.  Caps at MAX_ORDERS to avoid
 * runaway GraphQL cost on large stores.
 */
export async function calcSalesVelocity(
  admin: AdminApiContext,
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const queryStr = `created_at:>'${since.toISOString()}' -status:cancelled`;

  const unitsSold = new Map<string, number>();
  let cursor: string | null = null;
  let total = 0;

  while (total < MAX_ORDERS) {
    const res = await admin.graphql(ORDERS_QUERY, {
      variables: { query: queryStr, ...(cursor ? { after: cursor } : {}) },
    });
    const json: OrdersQueryResponse = await res.json();

    const throttle = json.extensions?.cost?.throttleStatus;
    if (throttle && throttle.currentlyAvailable < throttle.restoreRate * 1.5) {
      const needed = throttle.restoreRate * 1.5 - throttle.currentlyAvailable;
      await new Promise((r) => setTimeout(r, Math.ceil((needed / throttle.restoreRate) * 1000)));
    }

    const page = json.data?.orders;
    if (!page) break;

    for (const { node: order } of page.edges) {
      for (const { node: item } of order.lineItems?.edges ?? []) {
        const pid: string | undefined = item.product?.legacyResourceId;
        if (pid && item.quantity > 0) {
          unitsSold.set(pid, (unitsSold.get(pid) ?? 0) + item.quantity);
        }
      }
      total++;
    }

    if (!page.pageInfo.hasNextPage) break;
    cursor = page.pageInfo.endCursor;
  }

  const velocity = new Map<string, number>();
  for (const [pid, units] of unitsSold) {
    velocity.set(pid, units / WINDOW_DAYS);
  }
  return velocity;
}

export function computeStockOutDays(qty: number, avgDailySales: number | null | undefined): number | null {
  if (!avgDailySales || avgDailySales <= 0) return null;
  if (qty <= 0) return 0;
  return Math.min(999, Math.ceil(qty / avgDailySales));
}

// Recomputes every tracked variant's avgDailySales/stockOutDays for a shop in
// one pass — the shared implementation behind both the manual "Sync" action
// and the daily velocity cron (see workers/inventory-buffer.worker.ts).
// Reads current rows from the DB rather than taking a caller-supplied list,
// so both callers get identical behavior without duplicating the update loop.
export async function refreshShopVelocity(shop: string, admin: AdminApiContext): Promise<{ updatedProducts: number }> {
  const velocity = await calcSalesVelocity(admin);
  const rows = await prisma.inventoryTracking.findMany({
    where: { shop },
    select: { id: true, productId: true, currentQuantity: true, zeroSalesSinceAt: true },
  });
  if (rows.length === 0) return { updatedProducts: 0 };

  const now = new Date();
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((r) => {
        // A product absent from the map had zero orders in the window — that's
        // written explicitly (not skipped) so a product that's gone dead
        // actually reflects that instead of keeping a stale number from the
        // last time it sold.
        const avg = velocity.get(r.productId.toString()) ?? 0;
        // Dead-stock detection (Enterprise reporting): preserve the original
        // transition-to-zero timestamp across repeated zero readings rather
        // than resetting it every sync, so "days since zero sales" actually
        // measures elapsed time. Cleared the instant velocity recovers.
        const zeroSalesSinceAt = avg > 0 ? null : (r.zeroSalesSinceAt ?? now);
        return prisma.inventoryTracking.update({
          where: { id: r.id },
          data: {
            avgDailySales: avg,
            velocityUpdatedAt: now,
            stockOutDays: computeStockOutDays(r.currentQuantity, avg),
            zeroSalesSinceAt,
          },
        });
      }),
    );
  }

  return { updatedProducts: new Set(rows.map((r) => r.productId.toString())).size };
}
