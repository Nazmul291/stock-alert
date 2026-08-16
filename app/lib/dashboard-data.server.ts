import prisma from "../db.server";
import { syncState } from "./sync-state.server";
import { getCachedSettings, getCachedSession, getCachedShopName } from "./shop-cache.server";
import { rollupStatusCounts, atRiskRepresentativeRows, countDistinctProducts } from "./inventory-rollup.server";
import { canUseFeature } from "./plan-limits";
import { previewPurchaseOrders } from "./purchase-order.server";
import { deadStockSummary } from "./dead-stock.server";
import { localHourAndWeekday } from "./notification-schedule";
import { deriveShopDisplayName, greetingForHour } from "./shop-display";

// null per-field when there's no snapshot ~7 days back yet (new install, or
// the cron hasn't accumulated a week of history since this shipped) or the
// baseline was 0 — never a fabricated 0%.
export type DashboardTrend = {
  totalProducts: number | null;
  inStock: number | null;
  lowStock: number | null;
  outOfStock: number | null;
};

// 7-element arrays, oldest first — the last element is always the *live*
// current stat (not necessarily today's cron snapshot, which may not have
// run yet), so a card's sparkline endpoint always matches the big number
// shown above it.
export type DashboardStatHistory = {
  totalProducts: number[];
  inStock: number[];
  lowStock: number[];
  outOfStock: number[];
};

export type DashboardHealth = {
  pct: number;
  label: "Good" | "Fair" | "Needs Attention";
  trend: { direction: "better" | "worse" | "same" | null; deltaPts: number | null };
};

export type DashboardTopRecommendedProduct = {
  productId: string;
  productTitle: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  recommendedQuantity: number;
  stockOutDays: number | null;
  orderByDate: string | null;
};

export type DashboardData = {
  plan: string;
  greeting: string;
  shopDisplayName: string;
  dateRange: { start: string; end: string };
  stats: {
    totalProducts: number;
    outOfStock: number;
    lowStock: number;
    inStock: number;
    hidden: number;
    deactivated: number;
    requiresUpgrade: number;
  };
  statHistory: DashboardStatHistory;
  trend: DashboardTrend;
  health: DashboardHealth;
  // Enterprise-only (deadStockAlerts, see plan-limits.ts) — 0 on plans
  // without the entitlement, same as every other Enterprise-gated field on
  // this page (topRecommendedProduct, readyForReorderCount), not a
  // fabricated zero.
  deadStockCount: number;
  topRecommendedProduct: DashboardTopRecommendedProduct | null;
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
  atRiskProducts: { productId: string; productTitle: string | null; sku: string | null; currentQuantity: number; inventoryStatus: string; stockOutDays: number | null; imageUrl: string | null; imageAlt: string | null }[];
  readyForReorderCount: number;
};

// Percent change vs. a prior baseline — null (not 0%) when there's no
// baseline yet or it was 0, so the UI can tell "no trend data" apart from
// "genuinely flat." Pure — exported separately so it's unit-testable
// without a live DB connection.
export function pctChange(current: number, prior: number | undefined): number | null {
  return prior === undefined || prior === 0 ? null : Math.round(((current - prior) / prior) * 100);
}

// Fixed thresholds, not derived from anything in the mockup — a judgment
// call, kept here so it's one place to tune.
export function healthLabel(pct: number): "Good" | "Fair" | "Needs Attention" {
  if (pct >= 80) return "Good";
  if (pct >= 50) return "Fair";
  return "Needs Attention";
}

export function healthPercent(inStock: number, totalProducts: number): number {
  return totalProducts > 0 ? Math.round((inStock / totalProducts) * 100) : 0;
}

// Picks the single most urgent reorder candidate across every supplier
// group — smallest stockOutDays wins. Pure — exported separately so it's
// unit-testable without a live DB connection.
export function pickTopRecommendedLine<T extends { stockOutDays: number | null }>(lines: T[]): T | null {
  let best: T | null = null;
  for (const line of lines) {
    if (line.stockOutDays === null) continue;
    if (best === null || (best.stockOutDays !== null && line.stockOutDays < best.stockOutDays)) best = line;
  }
  return best;
}

export async function loadDashboardData(shop: string): Promise<DashboardData> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 6);
  sevenDaysAgo.setUTCHours(0, 0, 0, 0);

  // Fetched first (cheap — cached in Redis/memory, see getCachedSession) so
  // the purchase-order preview below can be skipped entirely for shops whose
  // plan can never use it, instead of unconditionally paying for the extra
  // supplier/inventory queries it needs on every single dashboard load.
  // settings is fetched alongside it (also cached) since deadStockThresholdDays
  // needs to be known before building the conditional dead-stock query below.
  const [storeSession, settings] = await Promise.all([getCachedSession(shop), getCachedSettings(shop)]);
  const plan = storeSession?.plan ?? "basic";
  const canManagePurchaseOrders = canUseFeature(plan, "purchaseOrders");
  const canTrackDeadStock = canUseFeature(plan, "deadStockAlerts");

  const [statusCounts, hiddenCount, setupProgress, recentAlerts, alertsToday, shopSyncState, sparkRows, atRiskRaw, stockOutSoonCount, poPreview, priorSnapshot, historyRows, shopName, deadStock] = await Promise.all([
    rollupStatusCounts(shop),
    countDistinctProducts({ shop, isHidden: true }),
    prisma.setupProgress.findUnique({ where: { shop } }),
    prisma.alertHistory.findMany({ where: { shop }, orderBy: { sentAt: "desc" }, take: 10 }),
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
    canManagePurchaseOrders ? previewPurchaseOrders(shop) : Promise.resolve([]),
    // Closest snapshot at-or-before 7 days ago — tolerant of the cron
    // missing a day (e.g. worker downtime) rather than requiring an exact
    // date match.
    prisma.dashboardSnapshot.findFirst({ where: { shop, date: { lte: sevenDaysAgo } }, orderBy: { date: "desc" } }),
    // Daily snapshots for the stat-card sparklines — up to 7 rows (today's
    // cron may not have run yet, gap-filled below the same way spark7 is).
    prisma.dashboardSnapshot.findMany({ where: { shop, date: { gte: sevenDaysAgo } }, orderBy: { date: "asc" } }),
    getCachedShopName(shop),
    // Only 1 item needed — the donut just shows the count, not a list (the
    // full item list lives on the Analytics page's DeadStockSection).
    canTrackDeadStock ? deadStockSummary(shop, settings?.deadStockThresholdDays ?? 60, 1) : Promise.resolve({ count: 0, items: [] }),
  ]);

  const readyForReorderCount = canManagePurchaseOrders
    ? poPreview.reduce((sum, s) => sum + s.lines.length, 0)
    : 0;

  const stats = {
    totalProducts: (statusCounts.get("in_stock") ?? 0) + (statusCounts.get("low_stock") ?? 0) + (statusCounts.get("out_of_stock") ?? 0),
    outOfStock: statusCounts.get("out_of_stock") ?? 0,
    lowStock: statusCounts.get("low_stock") ?? 0,
    inStock: statusCounts.get("in_stock") ?? 0,
    hidden: hiddenCount,
    deactivated: statusCounts.get("deactivated") ?? 0,
    requiresUpgrade: statusCounts.get("requires_upgrade") ?? 0,
  };

  const trend: DashboardTrend = {
    totalProducts: pctChange(stats.totalProducts, priorSnapshot?.totalProducts),
    inStock: pctChange(stats.inStock, priorSnapshot?.inStock),
    lowStock: pctChange(stats.lowStock, priorSnapshot?.lowStock),
    outOfStock: pctChange(stats.outOfStock, priorSnapshot?.outOfStock),
  };

  const healthPct = healthPercent(stats.inStock, stats.totalProducts);
  const health: DashboardHealth = {
    pct: healthPct,
    label: healthLabel(healthPct),
    trend: (() => {
      if (!priorSnapshot) return { direction: null, deltaPts: null };
      const priorPct = healthPercent(priorSnapshot.inStock, priorSnapshot.totalProducts);
      const deltaPts = healthPct - priorPct;
      return { direction: deltaPts > 0 ? "better" as const : deltaPts < 0 ? "worse" as const : "same" as const, deltaPts };
    })(),
  };

  // Single most-urgent reorder candidate across every supplier group — only
  // meaningful on plans that can actually place a PO (poPreview is already
  // an empty array otherwise, see above).
  const topRecommendedProduct: DashboardTopRecommendedProduct | null = (() => {
    const allLines = poPreview.flatMap((group) => group.lines.map((line) => ({ ...line, leadTimeDays: group.leadTimeDays })));
    const top = pickTopRecommendedLine(allLines);
    if (!top) return null;
    const daysUntilOrder = Math.max(0, (top.stockOutDays ?? 0) - top.leadTimeDays);
    const orderByDate = new Date();
    orderByDate.setDate(orderByDate.getDate() + daysUntilOrder);
    return {
      productId: top.productId,
      productTitle: top.productTitle,
      imageUrl: top.imageUrl,
      imageAlt: top.imageAlt,
      recommendedQuantity: top.suggestedQuantity,
      stockOutDays: top.stockOutDays,
      orderByDate: orderByDate.toISOString().slice(0, 10),
    };
  })();

  // Local hour per the shop's configured notification timezone (defaults to
  // UTC, same fallback as everywhere else digestTimezone is read) — reuses
  // the Intl-based lookup already built for the notification schedule crons,
  // rather than the server's own clock.
  const { hour } = localHourAndWeekday(new Date(), settings?.digestTimezone ?? "UTC");
  const greeting = greetingForHour(hour);
  // Real business name from the Admin API when available; falls back to the
  // slug-derived guess (never a blank/undefined greeting) if that call fails.
  const shopDisplayName = shopName ?? deriveShopDisplayName(shop);

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

  const dateRange = { start: sevenDaysAgo.toISOString().slice(0, 10), end: todayUTC.toISOString().slice(0, 10) };

  // Same gap-fill shape as spark7, but 4 parallel series (one per stat) —
  // the last element is overwritten with the *live* stat value below so a
  // card's sparkline always ends where its big number says, even if today's
  // snapshot cron hasn't run yet.
  const historyByDay = new Map(historyRows.map((r) => [r.date.toISOString().slice(0, 10), r]));
  const buildHistory = (pick: (row: { totalProducts: number; inStock: number; lowStock: number; outOfStock: number }) => number, live: number) =>
    Array.from({ length: 7 }, (_, i) => {
      if (i === 6) return live;
      const d = new Date(todayUTC);
      d.setUTCDate(d.getUTCDate() - (6 - i));
      const row = historyByDay.get(d.toISOString().slice(0, 10));
      return row ? pick(row) : 0;
    });
  const statHistory: DashboardStatHistory = {
    totalProducts: buildHistory((r) => r.totalProducts, stats.totalProducts),
    inStock: buildHistory((r) => r.inStock, stats.inStock),
    lowStock: buildHistory((r) => r.lowStock, stats.lowStock),
    outOfStock: buildHistory((r) => r.outOfStock, stats.outOfStock),
  };

  return {
    plan,
    greeting,
    shopDisplayName,
    dateRange,
    stats,
    statHistory,
    trend,
    health,
    deadStockCount: deadStock.count,
    topRecommendedProduct,
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
      stockOutDays: p.stockOutDays,
      imageUrl: p.imageUrl,
      imageAlt: p.imageAlt,
    })),
    readyForReorderCount,
  };
}
