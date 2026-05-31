export const PLAN_LIMITS = {
  basic: {
    name: 'Basic',
    price: '$3.99/month',
    maxProducts: 1000,
    features: [
      'Auto-hide sold out products',
      'Email notifications',
      'Slack notifications',
      'Global threshold settings',
      'Basic inventory tracking',
      'Up to 1,000 products',
      '30-day free trial',
    ],
    restrictions: {
      slackNotifications: true,
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
      'Slack notifications',
      'Per-product thresholds',
      'Auto-republish when restocked',
      'Advanced rules & collections',
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

export function getPlanLimits(plan: string = 'basic') {
  const planType = (plan === 'pro' ? 'pro' : 'basic') as PlanType;
  return PLAN_LIMITS[planType];
}

export function getMaxProducts(plan: string = 'basic'): number {
  return getPlanLimits(plan).maxProducts;
}

export function canUseFeature(
  plan: string = 'basic',
  feature: keyof typeof PLAN_LIMITS.basic.restrictions,
): boolean {
  return getPlanLimits(plan).restrictions[feature];
}

export function validateProductLimit(
  plan: string = 'basic',
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
      : `You've reached the ${limits.maxProducts} product limit on the ${limits.name} plan. Upgrade to Professional to track up to 10,000 products.`,
  };
}
