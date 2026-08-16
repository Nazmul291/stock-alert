import prisma from "../db.server";
import {
  storeForecastParams, monthDayInTimeZone, resolveForecastParams,
  type ForecastParams, type ForecastRuleLike, type ForecastMode, type ResolvedForecast,
} from "./forecast-mode";

// Everything the resolver needs for one shop, loaded once per request rather
// than per row. previewPurchaseOrders runs on every dashboard render and has
// no `admin` context, so all of this deliberately comes from local DB state —
// no Shopify round trips (which is also why collection membership is
// materialized ahead of time; see refreshForecastCollectionMembers).
export type ForecastContext = {
  mode: ForecastMode;
  defaults: ForecastParams;
  effectiveThreshold: number;
  rules: ForecastRuleLike[];
  // collectionId -> productIds. Empty unless custom mode has collection rules.
  membersByCollection: Map<string, Set<string>>;
  // Shop-local MM-DD, for seasonal rule windows.
  monthDay: number;
};

export async function getForecastContext(shop: string): Promise<ForecastContext> {
  const settings = await prisma.storeSettings.findUnique({ where: { shop } });
  const mode: ForecastMode =
    settings?.forecastMode === "classic" || settings?.forecastMode === "custom" ? settings.forecastMode : "smart";
  const defaults = storeForecastParams({
    forecastMode: mode,
    supplierLeadTimeDays: settings?.supplierLeadTimeDays ?? 7,
    safetyStockDays: settings?.safetyStockDays ?? 0,
    minStockLevel: settings?.minStockLevel ?? null,
  });

  // Rules are only ever consulted in custom mode — skip both queries
  // entirely otherwise so smart/classic shops pay nothing for this feature.
  const rules: ForecastRuleLike[] =
    mode === "custom"
      ? await prisma.forecastRule.findMany({ where: { shop, enabled: true } })
      : [];

  const membersByCollection = new Map<string, Set<string>>();
  const collectionIds = [...new Set(rules.filter((r) => r.scopeType === "collection").map((r) => r.scopeValue))];
  if (collectionIds.length > 0) {
    const members = await prisma.forecastCollectionMember.findMany({
      where: { shop, collectionId: { in: collectionIds } },
      select: { collectionId: true, productId: true },
    });
    for (const m of members) {
      const set = membersByCollection.get(m.collectionId) ?? new Set<string>();
      set.add(m.productId.toString());
      membersByCollection.set(m.collectionId, set);
    }
  }

  return {
    mode,
    defaults,
    effectiveThreshold: settings?.lowStockThreshold ?? 5,
    rules,
    membersByCollection,
    monthDay: monthDayInTimeZone(new Date(), settings?.digestTimezone ?? "UTC"),
  };
}

// Per-row convenience wrapper — keeps the Set lookup and the target shape in
// one place instead of repeating it at each call site.
export function resolveForRow(
  ctx: ForecastContext,
  row: { productId: bigint | string; vendor: string | null; tags: string | null },
): ResolvedForecast {
  const productId = row.productId.toString();
  const collectionIds = new Set<string>();
  for (const [collectionId, products] of ctx.membersByCollection) {
    if (products.has(productId)) collectionIds.add(collectionId);
  }
  return resolveForecastParams(
    ctx.mode,
    ctx.defaults,
    ctx.rules,
    { productId, vendor: row.vendor, tags: row.tags, collectionIds },
    ctx.monthDay,
  );
}
