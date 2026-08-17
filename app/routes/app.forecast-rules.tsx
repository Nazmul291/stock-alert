import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { SCOPE_SPECIFICITY, type ScopeType } from "../lib/forecast-mode";
import { SuppliersUpsellCard } from "../components/suppliers/SuppliersUpsellCard";
import { ForecastRulesList, type ForecastRuleRow } from "../components/forecast-rules/ForecastRulesList";

const SCOPE_TYPES: ScopeType[] = ["product", "collection", "vendor", "tag"];

function parseMonthDay(raw: string): number | null {
  // Accepts "MM-DD" from a plain date-ish input and stores it as MMDD.
  const m = /^(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return month * 100 + day;
}

function intOrNull(raw: string, min: number, max: number): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = parseInt(t, 10);
  return !isNaN(n) && n >= min && n <= max ? n : null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;
  const canManage = canUseFeature(plan, "customForecastRules");

  if (!canManage) return { canManage: false as const, rules: [] as ForecastRuleRow[], forecastMode: "smart", vendors: [] as string[], tags: [] as string[], collectionsSynced: 0 };

  const [rules, settings, distinctVendors, tagRows, collectionsSynced] = await Promise.all([
    prisma.forecastRule.findMany({ where: { shop }, orderBy: [{ scopeType: "asc" }, { priority: "desc" }, { createdAt: "asc" }] }),
    prisma.storeSettings.findUnique({ where: { shop }, select: { forecastMode: true } }),
    // Offered as datalist suggestions so a merchant doesn't have to
    // remember exact vendor spelling — and so a rule that would match
    // nothing is harder to create by accident.
    prisma.inventoryTracking.findMany({
      where: { shop, vendor: { not: null } },
      select: { vendor: true },
      distinct: ["vendor"],
      take: 200,
    }),
    prisma.inventoryTracking.findMany({ where: { shop, tags: { not: null } }, select: { tags: true }, take: 500 }),
    prisma.forecastCollectionMember.count({ where: { shop } }),
  ]);

  const tags = [...new Set(tagRows.flatMap((r) => (r.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean)))].sort().slice(0, 200);

  return {
    canManage: true as const,
    forecastMode: settings?.forecastMode ?? "smart",
    collectionsSynced,
    vendors: distinctVendors.map((v) => v.vendor as string).sort(),
    tags,
    rules: rules.map((r): ForecastRuleRow => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      scopeType: r.scopeType,
      scopeValue: r.scopeValue,
      basis: r.basis,
      leadTimeDays: r.leadTimeDays,
      safetyStockDays: r.safetyStockDays,
      minStockLevel: r.minStockLevel,
      seasonStart: r.seasonStart,
      seasonEnd: r.seasonEnd,
      priority: r.priority,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  if (!canUseFeature(storeSession?.plan ?? null, "customForecastRules")) {
    return { success: false as const, error: "Custom forecast rules are an Enterprise plan feature." };
  }

  const form = await request.formData();
  const intent = form.get("intent") as string;
  const str = (k: string) => ((form.get(k) as string) ?? "").trim();

  if (intent === "delete_rule") {
    await prisma.forecastRule.deleteMany({ where: { id: str("id"), shop } });
    return { success: true as const, intent };
  }

  if (intent === "toggle_rule") {
    const rule = await prisma.forecastRule.findFirst({ where: { id: str("id"), shop } });
    if (!rule) return { success: false as const, error: "Rule not found." };
    await prisma.forecastRule.update({ where: { id: rule.id }, data: { enabled: !rule.enabled } });
    return { success: true as const, intent };
  }

  if (intent === "save_rule") {
    const name = str("name");
    const scopeType = str("scopeType") as ScopeType;
    const scopeValue = str("scopeValue");
    const basis = str("basis") === "fixed" ? "fixed" : "velocity";

    if (!name) return { success: false as const, error: "Give the rule a name." };
    if (!SCOPE_TYPES.includes(scopeType)) return { success: false as const, error: "Choose what the rule applies to." };
    if (!scopeValue) return { success: false as const, error: "Choose which product/collection/vendor/tag this applies to." };

    const minStockLevel = intOrNull(str("minStockLevel"), 0, 100000);
    if (basis === "fixed" && minStockLevel === null) {
      return { success: false as const, error: "A fixed-level rule needs a minimum stock level." };
    }

    // A season needs both ends or neither — one-sided would silently mean
    // "always on", which isn't what anyone typing one date intends.
    const seasonStart = parseMonthDay(str("seasonStart"));
    const seasonEnd = parseMonthDay(str("seasonEnd"));
    if ((seasonStart === null) !== (seasonEnd === null)) {
      return { success: false as const, error: "Set both a season start and end, or leave both blank." };
    }

    const data = {
      name,
      scopeType,
      scopeValue,
      basis,
      leadTimeDays: intOrNull(str("leadTimeDays"), 1, 90),
      safetyStockDays: intOrNull(str("safetyStockDays"), 0, 90),
      minStockLevel,
      seasonStart,
      seasonEnd,
      // Seeded from scope specificity so the common case (more specific
      // scope wins) needs no manual tuning; an explicit value overrides it.
      priority: intOrNull(str("priority"), 0, 10000) ?? SCOPE_SPECIFICITY[scopeType],
    };

    const id = str("id");
    if (id) {
      await prisma.forecastRule.updateMany({ where: { id, shop }, data });
    } else {
      await prisma.forecastRule.create({ data: { shop, enabled: true, ...data } });
    }
    return { success: true as const, intent };
  }

  return { success: false as const, error: "Unknown action." };
};

export default function ForecastRulesPage() {
  const data = useLoaderData<typeof loader>();

  if (!data.canManage) {
    return (
      <s-page heading="Forecast Rules" sub-heading="Custom forecasting rules for specific products, collections, vendors, or seasons">
        <SuppliersUpsellCard />
      </s-page>
    );
  }

  return (
    <s-page heading="Forecast Rules" sub-heading="Custom forecasting rules for specific products, collections, vendors, or seasons">
      <ForecastRulesList
        rules={data.rules}
        forecastMode={data.forecastMode}
        vendors={data.vendors}
        tags={data.tags}
        collectionsSynced={data.collectionsSynced}
      />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
