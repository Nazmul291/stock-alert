import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { PRODUCTS_PRICING_RULES_QUERY } from "./graphql";

// Per-product only — no global/store-wide default. Stored as a metafield on
// the product itself (namespace "stock_alert", key "pricing_rule"), the
// same way custom_threshold/auto_hide/auto_republish already are, not in
// our own database — see product-detail.server.ts / ProductConfigureCard.
export type PricingRuleType = "percentage" | "add" | "times";
export type PricingRuleConfig = { enabled: boolean; type: PricingRuleType; value: number };

export const DEFAULT_PRICING_RULE: PricingRuleConfig = { enabled: false, type: "times", value: 2 };

export function parsePricingRuleConfig(raw: string | null | undefined): PricingRuleConfig {
  if (!raw) return DEFAULT_PRICING_RULE;
  try {
    const parsed = JSON.parse(raw) as { enabled?: unknown; type?: unknown; value?: unknown };
    const type: PricingRuleType = parsed.type === "percentage" || parsed.type === "add" ? parsed.type : "times";
    const value = typeof parsed.value === "number" && isFinite(parsed.value) && parsed.value >= 0 ? parsed.value : 0;
    return { enabled: !!parsed.enabled, type, value };
  } catch {
    return DEFAULT_PRICING_RULE;
  }
}

// percentage: cost plus a markup % of itself (e.g. 50% on a $10 cost -> $15)
// add: cost plus a flat amount (e.g. +$5 on a $10 cost -> $15)
// times: cost multiplied by a factor (e.g. 2x on a $10 cost -> $20)
export function applyPricingRule(config: PricingRuleConfig, unitCost: number): number {
  switch (config.type) {
    case "percentage": return unitCost * (1 + config.value / 100);
    case "add": return unitCost + config.value;
    case "times": return unitCost * config.value;
  }
}

// Batch lookup keyed by productId string — used by syncLineCostsToShopify,
// which needs each PO line's own product's rule (a PO can span several
// products even though this feature is configured per product).
export async function getPricingRuleConfigs(admin: AdminApiContext, productIds: bigint[]): Promise<Map<string, PricingRuleConfig>> {
  const map = new Map<string, PricingRuleConfig>();
  if (productIds.length === 0) return map;

  const ids = productIds.map((id) => `gid://shopify/Product/${id.toString()}`);
  const res = await admin.graphql(PRODUCTS_PRICING_RULES_QUERY, { variables: { ids } });
  const json: { data?: { nodes: Array<{ id?: string; metafield?: { value: string } | null } | null> } } = await res.json();
  for (const node of json.data?.nodes ?? []) {
    if (!node?.id) continue;
    const productId = node.id.split("/").pop() as string;
    map.set(productId, parsePricingRuleConfig(node.metafield?.value));
  }
  return map;
}
