// status drives what the billing page shows/allows for a tier:
// - "active": purchasable now (normal submit button).
// - "coming_soon": shown as a preview card, not purchasable — no
//   billing.request() wiring, nothing in `restrictions` is enforced for it.
// - "disabled": hidden from the billing page entirely (e.g. a tier being
//   retired). Not used by any tier today, but the billing page already
//   handles it so retiring a plan later is a one-line status flip.
export type PlanStatus = 'active' | 'coming_soon' | 'disabled';

export const PLAN_LIMITS = {
  none: {
    name: 'None',
    price: null,
    maxProducts: 0,
    status: 'disabled' as PlanStatus,
    features: [],
    restrictions: {
      slackNotifications: false,
      klaviyoIntegration: false,
      asanaTaskCreation: false,
      outboundWebhook: false,
      perProductThresholds: false,
      autoRepublish: false,
      multipleRecipients: false,
      dailyDigest: false,
      whiteLabelEmails: false,
      prioritySupport: false,
      coreLimitedEditionSections: false,
      deadStockAlerts: false,
      vendorGrouping: false,
      vendorLeadTimeReorderPoints: false,
      purchaseOrders: false,
    },
  },
  basic: {
    name: 'Basic',
    price: '$3.99',
    maxProducts: 1000,
    status: 'active' as PlanStatus,
    // Purely qualitative bullets — product count and trial length are
    // structural facts already derived from maxProducts/price elsewhere in
    // the UI, not baked in here as text (that's exactly the kind of string
    // that silently goes stale when maxProducts changes).
    features: [
      'Auto-hide sold out products',
      'Email & WhatsApp notifications',
      'Native Shopify Flow triggers',
      'Global threshold settings',
      'Basic inventory tracking',
    ],
    restrictions: {
      slackNotifications: false,
      klaviyoIntegration: false,
      asanaTaskCreation: false,
      outboundWebhook: false,
      perProductThresholds: false,
      autoRepublish: false,
      multipleRecipients: false,
      dailyDigest: false,
      whiteLabelEmails: false,
      prioritySupport: false,
      coreLimitedEditionSections: false,
      deadStockAlerts: false,
      vendorGrouping: false,
      vendorLeadTimeReorderPoints: false,
      purchaseOrders: false,
    },
  },
  pro: {
    name: 'Professional',
    price: '$9.99',
    maxProducts: 10000,
    status: 'active' as PlanStatus,
    features: [
      'Everything in Basic, plus:',
      'Slack Connect',
      'Klaviyo integration',
      'Outbound webhooks (Zapier/Make)',
      'Per-product thresholds',
      'Auto-republish when restocked',
      'White-label branded emails',
      'Multiple notification recipients',
      'Priority support',
    ],
    restrictions: {
      slackNotifications: true,
      klaviyoIntegration: true,
      asanaTaskCreation: true,
      outboundWebhook: true,
      perProductThresholds: true,
      autoRepublish: true,
      multipleRecipients: true,
      dailyDigest: true,
      whiteLabelEmails: true,
      prioritySupport: true,
      coreLimitedEditionSections: false,
      deadStockAlerts: false,
      vendorGrouping: false,
      vendorLeadTimeReorderPoints: false,
      purchaseOrders: false,
    },
  },
  // Purchasable tier — billing.request()/billing.check() wired in
  // app.billing._index.tsx / app.billing.confirm.tsx, and the Shopify billing
  // config lives in app/shopify.server.ts. Suppliers + Purchase Orders (the
  // purchaseOrders restriction below) is the flagship Enterprise-exclusive
  // feature: see app/lib/purchase-order.server.ts and app/routes/app.suppliers.tsx.
  enterprise: {
    name: 'Enterprise',
    price: '$19.99',
    maxProducts: Infinity,
    status: 'active' as PlanStatus,
    features: [
      'Everything in Professional, plus:',
      'Core vs. Limited-Edition report sections',
      'Dead stock alerts',
      'Suppliers & purchase order generation',
      'Reorder points by vendor lead time',
    ],
    restrictions: {
      slackNotifications: true,
      klaviyoIntegration: true,
      asanaTaskCreation: true,
      outboundWebhook: true,
      perProductThresholds: true,
      autoRepublish: true,
      multipleRecipients: true,
      dailyDigest: true,
      whiteLabelEmails: true,
      prioritySupport: true,
      coreLimitedEditionSections: true,
      deadStockAlerts: true,
      vendorGrouping: true,
      vendorLeadTimeReorderPoints: true,
      purchaseOrders: true,
    },
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan?: string | null) {
  const planType = (
    plan === 'pro' ? 'pro' : plan === 'basic' ? 'basic' : plan === 'enterprise' ? 'enterprise' : 'none'
  ) as PlanType;
  return PLAN_LIMITS[planType];
}

export function getMaxProducts(plan?: string | null): number {
  return getPlanLimits(plan).maxProducts;
}

// maxProducts is Infinity for unlimited tiers (Enterprise) — arithmetic and
// comparisons (>, >=, -) all behave correctly against Infinity on their own,
// but display and anything that needs a concrete integer (e.g. Prisma's
// `take`) must special-case it explicitly.
export function formatMaxProducts(maxProducts: number | null): string {
  return maxProducts !== null && Number.isFinite(maxProducts) ? maxProducts.toLocaleString() : 'Unlimited';
}

export function canUseFeature(
  plan: string | null | undefined,
  feature: keyof typeof PLAN_LIMITS.basic.restrictions,
): boolean {
  return getPlanLimits(plan).restrictions[feature];
}

export function validateProductLimit(
  plan: string | null | undefined,
  currentProductCount: number,
): { canAdd: boolean; currentCount: number; maxProducts: number; message: string } {
  const limits = getPlanLimits(plan);
  const canAdd = currentProductCount < limits.maxProducts;
  return {
    canAdd,
    currentCount: currentProductCount,
    maxProducts: limits.maxProducts,
    message: canAdd
      ? Number.isFinite(limits.maxProducts)
        ? `You can track ${limits.maxProducts - currentProductCount} more products on the ${limits.name} plan`
        : `You can track unlimited products on the ${limits.name} plan`
      : limits.maxProducts === 0
      ? `Select a plan to start tracking products.`
      : `You've reached the ${limits.maxProducts} product limit on the ${limits.name} plan. Upgrade to Professional to track up to 10,000 products.`,
  };
}
