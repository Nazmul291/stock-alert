export const PLAN_LIMITS = {
  none: {
    name: 'None',
    price: null,
    maxProducts: 0,
    features: [],
    restrictions: {
      slackNotifications: false,
      perProductThresholds: false,
      autoRepublish: false,
      advancedRules: false,
    },
  },
  basic: {
    name: 'Basic',
    price: '$3.99/month',
    maxProducts: 1000,
    features: [
      'Auto-hide sold out products',
      'Email & WhatsApp notifications',
      'Native Shopify Flow triggers',
      'Global threshold settings',
      'Basic inventory tracking',
      'Up to 1,000 products',
      '30-day free trial',
    ],
    restrictions: {
      slackNotifications: false,
      perProductThresholds: false,
      autoRepublish: false,
      advancedRules: false,
    },
  },
  pro: {
    name: 'Professional',
    price: '$9.99/month',
    maxProducts: 10000,
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
      'Up to 10,000 products',
      '30-day free trial',
    ],
    restrictions: {
      slackNotifications: true,
      perProductThresholds: true,
      autoRepublish: true,
      advancedRules: true,
    },
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export function getPlanLimits(plan?: string | null) {
  const planType = (plan === 'pro' ? 'pro' : plan === 'basic' ? 'basic' : 'none') as PlanType;
  return PLAN_LIMITS[planType];
}

export function getMaxProducts(plan?: string | null): number {
  return getPlanLimits(plan).maxProducts;
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
      ? `You can track ${limits.maxProducts - currentProductCount} more products on the ${limits.name} plan`
      : limits.maxProducts === 0
      ? `Select a plan to start tracking products.`
      : `You've reached the ${limits.maxProducts} product limit on the ${limits.name} plan. Upgrade to Professional to track up to 10,000 products.`,
  };
}
