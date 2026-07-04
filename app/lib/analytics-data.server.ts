import prisma from "../db.server";

export type AnalyticsData = {
  totalThisMonth: number;
  totalLastMonth: number;
  avgPerDay: number;
  busiest: { day: string; count: number };
  daily30: { day: string; count: number }[];
  typeBreakdown: { type: string; count: number }[];
  topProducts: { title: string; count: number }[];
  channel: { email: number; slack: number };
  stockHealth: { inStock: number; lowStock: number; outOfStock: number; deactivated: number };
};

export async function loadAnalyticsData(shop: string): Promise<AnalyticsData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  let dailyRows: { day: string; count: number }[] = [];
  let typeRows: { alert_type: string; count: number }[] = [];
  let topProductRows: { product_title: string; count: number }[] = [];
  let channelRow: { email_count: number; slack_count: number }[] = [];
  let totalThisMonth = 0;
  let totalLastMonth = 0;
  let stockGroups: { inventoryStatus: string; _count: { _all: number } }[] = [];

  try {
  ([
    dailyRows,
    typeRows,
    topProductRows,
    channelRow,
    totalThisMonth,
    totalLastMonth,
    stockGroups,
  ] = await Promise.all([
    // Alert count per day for last 30 days
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT TO_CHAR(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*)::int AS count
      FROM alert_history
      WHERE shop = ${shop} AND sent_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day ASC
    `,

    // Alert counts by type (last 30 days)
    prisma.$queryRaw<{ alert_type: string; count: number }[]>`
      SELECT alert_type, COUNT(*)::int AS count
      FROM alert_history
      WHERE shop = ${shop} AND sent_at >= ${thirtyDaysAgo}
      GROUP BY alert_type ORDER BY count DESC
    `,

    // Top 10 products by alert count (last 30 days)
    prisma.$queryRaw<{ product_title: string; count: number }[]>`
      SELECT product_title, COUNT(*)::int AS count
      FROM alert_history
      WHERE shop = ${shop} AND sent_at >= ${thirtyDaysAgo} AND product_title IS NOT NULL
      GROUP BY product_title ORDER BY count DESC LIMIT 10
    `,

    // Email vs Slack channel stats
    prisma.$queryRaw<{ email_count: number; slack_count: number }[]>`
      SELECT
        COUNT(CASE WHEN sent_to_email IS NOT NULL THEN 1 END)::int AS email_count,
        COUNT(CASE WHEN sent_to_slack = true THEN 1 END)::int AS slack_count
      FROM alert_history
      WHERE shop = ${shop} AND sent_at >= ${thirtyDaysAgo}
    `,

    prisma.alertHistory.count({ where: { shop, sentAt: { gte: thirtyDaysAgo } } }),
    prisma.alertHistory.count({ where: { shop, sentAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),

    // Current stock health
    prisma.inventoryTracking.groupBy({
      by: ["inventoryStatus"],
      where: { shop },
      _count: { _all: true },
    }),
  ]));
  } catch (err) {
    console.error("[analytics] loader error:", err);
  }

  // Build 30-element daily array (fill gaps with 0)
  // $queryRaw COUNT results come back as BigInt — convert to Number for JSON serialization
  const dayMap = new Map(dailyRows.map((r) => [r.day, Number(r.count)]));
  const todayUTC = new Date(now);
  todayUTC.setUTCHours(0, 0, 0, 0);
  const daily30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() - (29 - i));
    return { day: d.toISOString().slice(0, 10), count: dayMap.get(d.toISOString().slice(0, 10)) ?? 0 };
  });

  const busiest = daily30.reduce((a, b) => (b.count > a.count ? b : a), { day: "", count: 0 });
  const stockMap = new Map(stockGroups.map((g) => [g.inventoryStatus as string, g._count._all]));

  return {
    totalThisMonth,
    totalLastMonth,
    avgPerDay: daily30.reduce((s, d) => s + d.count, 0) / 30,
    busiest,
    daily30,
    typeBreakdown: typeRows.map((r) => ({ type: r.alert_type, count: Number(r.count) })),
    topProducts: topProductRows.map((r) => ({ title: r.product_title, count: Number(r.count) })),
    channel: { email: Number(channelRow[0]?.email_count ?? 0), slack: Number(channelRow[0]?.slack_count ?? 0) },
    stockHealth: {
      inStock:    stockMap.get("in_stock")    ?? 0,
      lowStock:   stockMap.get("low_stock")   ?? 0,
      outOfStock: stockMap.get("out_of_stock") ?? 0,
      deactivated: stockMap.get("deactivated") ?? 0,
    },
  };
}
