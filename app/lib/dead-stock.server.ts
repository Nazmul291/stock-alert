import prisma from "../db.server";

// Distinct concern from inventory-rollup.server.ts's status classification —
// this is quantity + time-since-zero-velocity, not variant status rollup.
// zeroSalesSinceAt is written by velocity.server.ts's refreshShopVelocity.

export type DeadStockRow = {
  productId: string;
  productTitle: string | null;
  quantity: number;
  daysSinceZeroSales: number;
};

// Product-level (not per-variant): a product counts as dead stock if it has
// any stock left across its tracked variants and none of them have sold in
// at least thresholdDays. Only considers monitoring_enabled rows, same as
// atRiskRepresentativeRows — this is a "should I act on this" report.
export async function deadStockSummary(
  shop: string,
  thresholdDays: number,
  limit = 10,
): Promise<{ count: number; items: DeadStockRow[] }> {
  const rows = await prisma.$queryRaw<
    { product_id: bigint; product_title: string | null; quantity: number; zero_sales_since_at: Date; total: bigint }[]
  >`
    SELECT product_id, product_title, SUM(current_quantity)::int AS quantity,
           MIN(zero_sales_since_at) AS zero_sales_since_at,
           COUNT(*) OVER()::bigint AS total
    FROM inventory_tracking
    WHERE shop = ${shop} AND monitoring_enabled = true
    GROUP BY product_id, product_title
    HAVING SUM(current_quantity) > 0
       AND MIN(zero_sales_since_at) IS NOT NULL
       AND MIN(zero_sales_since_at) <= NOW() - (${thresholdDays} * INTERVAL '1 day')
    ORDER BY zero_sales_since_at ASC
    LIMIT ${limit}
  `;

  const now = Date.now();
  return {
    count: rows.length > 0 ? Number(rows[0].total) : 0,
    items: rows.map((r) => ({
      productId: r.product_id.toString(),
      productTitle: r.product_title,
      quantity: r.quantity,
      daysSinceZeroSales: Math.floor((now - r.zero_sales_since_at.getTime()) / 86_400_000),
    })),
  };
}
