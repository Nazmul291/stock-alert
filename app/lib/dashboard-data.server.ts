import prisma from "../db.server";
import { syncState } from "./sync-state.server";
import { getCachedSettings, getCachedSession } from "./shop-cache.server";
import { rollupStatusCounts, atRiskRepresentativeRows, countDistinctProducts } from "./inventory-rollup.server";

export type DashboardData = {
  plan: string;
  stats: {
    totalProducts: number;
    outOfStock: number;
    lowStock: number;
    inStock: number;
    hidden: number;
    deactivated: number;
  };
  setupProgress: {
    appInstalled: boolean;
    globalSettingsConfigured: boolean;
    notificationsConfigured: boolean;
    firstProductTracked: boolean;
  };
  progressPct: number;
  syncRunning: boolean;
  lastSyncCompletedAt: string | null;
  lastSyncCount: number | null;
  lastWebhookAt: string | null;
  recentAlerts: { id: string; productTitle: string | null; alertType: string | null; sentAt: string }[];
  notificationEmail: string | null;
  alertsToday: number;
  spark7: number[];
  stockOutSoonCount: number;
  atRiskProducts: { productId: string; productTitle: string | null; sku: string | null; currentQuantity: number; inventoryStatus: string }[];
};

export async function loadDashboardData(shop: string): Promise<DashboardData> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  const [statusCounts, hiddenCount, settings, setupProgress, recentAlerts, storeSession, alertsToday, shopSyncState, sparkRows, atRiskRaw, stockOutSoonCount] = await Promise.all([
    rollupStatusCounts(shop),
    countDistinctProducts({ shop, isHidden: true }),
    getCachedSettings(shop),
    prisma.setupProgress.findUnique({ where: { shop } }),
    prisma.alertHistory.findMany({ where: { shop }, orderBy: { sentAt: "desc" }, take: 10 }),
    getCachedSession(shop),
    prisma.alertHistory.count({ where: { shop, sentAt: { gte: todayStart } } }),
    syncState.get(shop),
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT TO_CHAR(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM alert_history
      WHERE shop = ${shop} AND sent_at >= ${sevenDaysAgo}
      GROUP BY day
      ORDER BY day ASC
    `,
    atRiskRepresentativeRows(shop, 8),
    countDistinctProducts({ shop, stockOutDays: { not: null, lt: 7 }, inventoryStatus: { not: "out_of_stock" } }),
  ]);

  const stats = {
    totalProducts: (statusCounts.get("in_stock") ?? 0) + (statusCounts.get("low_stock") ?? 0) + (statusCounts.get("out_of_stock") ?? 0),
    outOfStock: statusCounts.get("out_of_stock") ?? 0,
    lowStock: statusCounts.get("low_stock") ?? 0,
    inStock: statusCounts.get("in_stock") ?? 0,
    hidden: hiddenCount,
    deactivated: statusCounts.get("deactivated") ?? 0,
  };

  const setupSteps = [
    setupProgress?.appInstalled ?? true,
    setupProgress?.globalSettingsConfigured ?? false,
    setupProgress?.notificationsConfigured ?? false,
    setupProgress?.firstProductTracked ?? false,
  ];
  const progressPct = Math.round((setupSteps.filter(Boolean).length / setupSteps.length) * 100);

  // Build a 7-element array [oldest … today] for the sparkline
  const rowMap = new Map(sparkRows.map((r) => [r.day, r.count]));
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  const spark7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(todayUTC);
    d.setUTCDate(d.getUTCDate() - (6 - i));
    return rowMap.get(d.toISOString().slice(0, 10)) ?? 0;
  });

  return {
    plan: storeSession?.plan ?? "basic",
    stats,
    setupProgress: {
      appInstalled: setupProgress?.appInstalled ?? true,
      globalSettingsConfigured: setupProgress?.globalSettingsConfigured ?? false,
      notificationsConfigured: setupProgress?.notificationsConfigured ?? false,
      firstProductTracked: setupProgress?.firstProductTracked ?? false,
    },
    progressPct,
    syncRunning: shopSyncState?.running ?? false,
    lastSyncCompletedAt: shopSyncState?.completedAt?.toISOString() ?? null,
    lastSyncCount: shopSyncState?.syncedCount ?? null,
    lastWebhookAt: shopSyncState?.lastWebhookAt?.toISOString() ?? null,
    recentAlerts: recentAlerts.map((a) => ({
      id: a.id,
      productTitle: a.productTitle,
      alertType: a.alertType,
      sentAt: a.sentAt.toISOString(),
    })),
    notificationEmail: settings?.notificationEmail ?? null,
    alertsToday,
    spark7,
    stockOutSoonCount,
    atRiskProducts: atRiskRaw.map((p) => ({
      productId: p.productId.toString(),
      productTitle: p.productTitle,
      sku: p.sku,
      currentQuantity: p.currentQuantity,
      inventoryStatus: p.inventoryStatus as string,
    })),
  };
}
