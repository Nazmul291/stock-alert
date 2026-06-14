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
  admin: any,
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
    const json: any = await res.json();

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
