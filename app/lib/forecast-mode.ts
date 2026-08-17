// Reorder-suggestion math, shared by every surface that recommends "reorder
// N units of X": the Reorder Planner (previewPurchaseOrders), the dashboard's
// Recommended Action banner (which reads the same preview), the PO product
// picker (searchTrackedProducts), and the product-detail Demand Forecast card
// (computeDemandForecast).
//
// SCOPE — read this before extending. Forecast mode governs *reorder
// suggestions only*. It deliberately does NOT touch low-stock alerting or
// InventoryTracking.inventoryStatus, both of which stay always-on: status is
// written unconditionally in inventory-event.server.ts and is read by the
// dashboard donut, the Products page filters, Top Items to Watch, analytics,
// digest emails, restock detection, and auto-hide/auto-republish. Gating any
// of that on a forecast mode would silently break all of them.
//
// Client-safe (no .server suffix, no DB/Shopify imports) so it can be
// unit-tested from a throwaway script and reused in components.

export type ForecastMode = "smart" | "classic" | "custom";

export function isForecastMode(value: unknown): value is ForecastMode {
  return value === "smart" || value === "classic" || value === "custom";
}

// The resolved inputs for one product/variant. In "smart"/"classic" these
// come straight from StoreSettings; in "custom" a matching ForecastRule can
// override any of them (see Phase 3's resolveForecastParams).
export type ForecastParams = {
  // "velocity": reorder point scales with each product's own sales rate.
  // "fixed":    a flat stock level, no sales history required.
  basis: "velocity" | "fixed";
  leadTimeDays: number;
  safetyStockDays: number;
  // null => fall back to the product's effective low-stock threshold, so
  // "classic" needs no extra configuration to start working.
  minStockLevel: number | null;
};

export type ReorderInput = {
  currentQuantity: number;
  avgDailySales: number | null;
  // Precomputed ceil(qty / avgDailySales) — passed in rather than derived so
  // the "smart" trigger stays bit-identical to the pre-existing
  // `stockOutDays <= leadTimeDays` comparison it replaces.
  stockOutDays: number | null;
  // Store-wide lowStockThreshold, or the product's custom_threshold
  // metafield override where one is set.
  effectiveThreshold: number;
};

export type ReorderTargets = {
  // Trigger level: reorder once quantity falls to or below this. null when
  // it can't be determined (velocity basis with no sales history).
  reorderPoint: number | null;
  // Target level to bring stock back up to. Same as reorderPoint today; kept
  // as its own field because they are conceptually different numbers and a
  // future "order up to" setting only needs to change one of them.
  orderUpToLevel: number | null;
  shouldReorder: boolean;
  // 0 means "we can't compute a quantity — let the merchant type one",
  // never "don't order". Callers surface it as an editable field.
  suggestedQuantity: number;
};

export function storeForecastParams(settings: {
  forecastMode: string;
  supplierLeadTimeDays: number;
  safetyStockDays: number;
  minStockLevel: number | null;
}): ForecastParams {
  const mode: ForecastMode = isForecastMode(settings.forecastMode) ? settings.forecastMode : "smart";
  return {
    // "custom" falls back to velocity as its *default* basis — an unmatched
    // product in custom mode behaves like smart mode rather than losing its
    // suggestion entirely. A matching rule overrides this.
    basis: mode === "classic" ? "fixed" : "velocity",
    leadTimeDays: settings.supplierLeadTimeDays,
    safetyStockDays: mode === "classic" ? 0 : settings.safetyStockDays,
    minStockLevel: settings.minStockLevel,
  };
}

// Pure. Given resolved params and one row's state, decide whether to reorder
// and how much.
//
// Equivalence note: with basis "velocity" and safetyStockDays 0 this produces
// exactly what suggestReorderQuantity + the old
// `stockOutDays <= leadTimeDays` filter produced, which is what makes the
// default ("smart", safetyStockDays 0) a genuine no-op for existing shops.
export function computeReorderTargets(params: ForecastParams, input: ReorderInput): ReorderTargets {
  const { currentQuantity, avgDailySales, stockOutDays, effectiveThreshold } = input;
  const isOutOfStock = currentQuantity <= 0;

  if (params.basis === "fixed") {
    const level = params.minStockLevel ?? effectiveThreshold;
    const shouldReorder = currentQuantity <= level;
    return {
      reorderPoint: level,
      orderUpToLevel: level,
      shouldReorder,
      // max(1, …) mirrors suggestReorderQuantity's "never a zero-quantity
      // no-op" rule — a line that triggered always carries a real number.
      suggestedQuantity: shouldReorder ? Math.max(1, level - currentQuantity) : 0,
    };
  }

  // Velocity basis. Days of cover = how long stock must last: the supplier's
  // lead time, plus any safety buffer held beyond it.
  const coverDays = params.leadTimeDays + params.safetyStockDays;
  const hasVelocity = avgDailySales !== null && avgDailySales > 0;

  if (!hasVelocity) {
    // No sales history to project from — common on a fresh shop, and
    // universal for a product that's been sitting at zero. Still flag an
    // out-of-stock item as needing a reorder (it plainly does), but leave
    // the quantity at 0 for the merchant to fill in rather than inventing
    // a number from data we don't have.
    return { reorderPoint: null, orderUpToLevel: null, shouldReorder: isOutOfStock, suggestedQuantity: 0 };
  }

  const level = Math.ceil(coverDays * (avgDailySales as number));
  return {
    reorderPoint: level,
    orderUpToLevel: level,
    shouldReorder: isOutOfStock || (stockOutDays !== null && stockOutDays <= coverDays),
    suggestedQuantity: Math.max(1, level - currentQuantity),
  };
}

// ── Custom mode: merchant-authored rules ────────────────────────────────

export const SCOPE_TYPES = ["product", "collection", "vendor", "tag"] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

// Specificity ranking, most specific first. Also seeds each rule's default
// `priority` on create so the common case needs no manual tuning.
export const SCOPE_SPECIFICITY: Record<ScopeType, number> = {
  product: 400,
  collection: 300,
  vendor: 200,
  tag: 100,
};

export type ForecastRuleLike = {
  id: string;
  name: string;
  enabled: boolean;
  scopeType: string;
  scopeValue: string;
  basis: string;
  leadTimeDays: number | null;
  safetyStockDays: number | null;
  minStockLevel: number | null;
  seasonStart: number | null;
  seasonEnd: number | null;
  priority: number;
  updatedAt: Date;
};

// What a rule is being matched against. tags/vendor come straight off the
// InventoryTracking row; collectionIds comes from the per-rule materialized
// membership table (see ForecastCollectionMember).
export type RuleTarget = {
  productId: string;
  vendor: string | null;
  tags: string | null; // comma-joined, as stored
  collectionIds: Set<string>;
};

// MM-DD as an int, e.g. Nov 1 -> 1101. Uses the *shop's* local date, not the
// server's: a season boundary should flip when it flips for the merchant.
export function monthDayInTimeZone(now: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, month: "2-digit", day: "2-digit" }).formatToParts(now);
    const month = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return parseInt(`${month}${day}`, 10);
  } catch {
    // Same UTC fallback as the notification schedule's Intl usage.
    return parseInt(`${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`, 10);
  }
}

// A rule with no window is always active. A window where start > end wraps
// the new year (e.g. 1101..0228 = Nov 1 through Feb 28), which is the common
// case for a holiday season and the reason this can't be a plain range check.
export function isSeasonActive(rule: { seasonStart: number | null; seasonEnd: number | null }, monthDay: number): boolean {
  const { seasonStart: start, seasonEnd: end } = rule;
  if (start === null || end === null) return true;
  return start <= end ? monthDay >= start && monthDay <= end : monthDay >= start || monthDay <= end;
}

export function ruleMatchesTarget(rule: ForecastRuleLike, target: RuleTarget): boolean {
  switch (rule.scopeType) {
    case "product":
      return rule.scopeValue === target.productId;
    case "vendor":
      // Case-insensitive: Shopify vendor strings are free text and merchants
      // type them inconsistently ("Acme" vs "acme").
      return (target.vendor ?? "").toLowerCase() === rule.scopeValue.toLowerCase();
    case "tag": {
      const want = rule.scopeValue.trim().toLowerCase();
      if (!want) return false;
      return (target.tags ?? "")
        .split(",")
        .some((t) => t.trim().toLowerCase() === want);
    }
    case "collection":
      return target.collectionIds.has(rule.scopeValue);
    default:
      return false;
  }
}

// Ordering: specificity → seasonal → priority → most recently updated.
//
// Seasonal outranks priority deliberately. A merchant who adds a Nov–Dec
// rule alongside an all-year rule on the same scope means the seasonal one
// to win during those months; making them also bump a priority number to
// get that would be the surprising outcome.
export function compareRules(a: ForecastRuleLike, b: ForecastRuleLike): number {
  const specA = SCOPE_SPECIFICITY[a.scopeType as ScopeType] ?? 0;
  const specB = SCOPE_SPECIFICITY[b.scopeType as ScopeType] ?? 0;
  if (specA !== specB) return specB - specA;
  const seasonalA = a.seasonStart !== null && a.seasonEnd !== null ? 1 : 0;
  const seasonalB = b.seasonStart !== null && b.seasonEnd !== null ? 1 : 0;
  if (seasonalA !== seasonalB) return seasonalB - seasonalA;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

export type ResolvedForecast = {
  params: ForecastParams;
  // Which rule produced these params, for the "why this number?" affordance
  // in the UI. null in smart/classic, or in custom when nothing matched.
  matchedRule: { id: string; name: string } | null;
};

// Picks the winning rule for one product and folds its overrides onto the
// store defaults. Pure — rules and collection membership are loaded once by
// the caller and passed in, since this runs per-row in a hot loop.
export function resolveForecastParams(
  mode: ForecastMode,
  defaults: ForecastParams,
  rules: ForecastRuleLike[],
  target: RuleTarget,
  monthDay: number,
): ResolvedForecast {
  if (mode !== "custom" || rules.length === 0) return { params: defaults, matchedRule: null };

  const matches = rules
    .filter((r) => r.enabled && isSeasonActive(r, monthDay) && ruleMatchesTarget(r, target))
    .sort(compareRules);
  const winner = matches[0];
  if (!winner) return { params: defaults, matchedRule: null };

  return {
    params: {
      basis: winner.basis === "fixed" ? "fixed" : "velocity",
      // Each override is independent — a rule that only sets safety days
      // still inherits the store's lead time, rather than resetting
      // everything it didn't mention.
      leadTimeDays: winner.leadTimeDays ?? defaults.leadTimeDays,
      safetyStockDays: winner.safetyStockDays ?? defaults.safetyStockDays,
      minStockLevel: winner.minStockLevel ?? defaults.minStockLevel,
    },
    matchedRule: { id: winner.id, name: winner.name },
  };
}

// Widest quantity that could possibly trigger a reorder anywhere in this
// shop — used to prefilter rows in SQL before per-row rule resolution runs
// in JS (per-row resolution is not expressible in SQL). Must over-select
// rather than under-select: a row wrongly excluded here can never be
// recovered by the exact check later. Returns null for "no quantity-based
// bound", meaning the caller must keep its velocity-based condition instead.
export function maxTriggerQuantity(
  params: ForecastParams,
  effectiveThreshold: number,
  rules: ForecastRuleLike[] = [],
): number | null {
  const candidates: number[] = [];
  if (params.basis === "fixed") candidates.push(params.minStockLevel ?? effectiveThreshold);
  // In custom mode any fixed-basis rule can pull in a row on quantity alone,
  // regardless of the store-level basis — so every such rule widens the net,
  // and the prefilter has to allow for the largest of them.
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.basis === "fixed") candidates.push(r.minStockLevel ?? params.minStockLevel ?? effectiveThreshold);
  }
  return candidates.length > 0 ? Math.max(...candidates) : null;
}
