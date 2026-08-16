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

// Widest quantity that could possibly trigger a reorder under these params —
// used to prefilter rows in SQL before per-row resolution runs in JS. Must
// over-select rather than under-select: a row wrongly excluded here can never
// be recovered later. Returns null for "no quantity-based bound", meaning the
// caller must keep its velocity-based condition instead.
export function maxTriggerQuantity(params: ForecastParams, effectiveThreshold: number): number | null {
  if (params.basis === "fixed") return params.minStockLevel ?? effectiveThreshold;
  return null;
}
