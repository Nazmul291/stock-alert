// Plan limits and validation
export const PLAN_LIMITS = {
  free: {
    name: 'Free',
    price: '$0/month',
    maxProducts: 10,
    features: [
      'Auto-hide sold out products',
      'Email notifications',
      'Global threshold settings',
      'Basic inventory tracking',
      'Up to 10 products'
    ],
    restrictions: {
      slackNotifications: false,
      perProductThresholds: false,
      autoRepublish: false,
      advancedRules: false
    }
  },
  pro: {
    name: 'Professional',
    price: '$9.99/month',
    maxProducts: 10000,
    features: [
      'Everything in Free, plus:',
      'Slack notifications',
      'Per-product thresholds',
      'Auto-republish when restocked',
      'Advanced rules & collections',
      'Multiple notification users',
      'Priority support',
      'Up to 10,000 products'
    ],
    restrictions: {
      slackNotifications: true,
      perProductThresholds: true,
      autoRepublish: true,
      advancedRules: true
    }
  }
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export interface PlanValidationResult {
  canAddProduct: boolean;
  currentCount: number;
  maxProducts: number;
  plan: PlanType;
  message?: string;
}

export function getPlanLimits(plan: string = 'free') {
  const planType = (plan === 'pro' ? 'pro' : 'free') as PlanType;
  return PLAN_LIMITS[planType];
}

export function validateProductLimit(
  plan: string = 'free', 
  currentProductCount: number
): PlanValidationResult {
  const planLimits = getPlanLimits(plan);
  const planType = (plan === 'pro' ? 'pro' : 'free') as PlanType;
  
  const canAddProduct = currentProductCount < planLimits.maxProducts;
  
  return {
    canAddProduct,
    currentCount: currentProductCount,
    maxProducts: planLimits.maxProducts,
    plan: planType,
    message: canAddProduct 
      ? `You can track ${planLimits.maxProducts - currentProductCount} more products on the ${planLimits.name} plan`
      : `You've reached the ${planLimits.maxProducts} product limit for the ${planLimits.name} plan. Upgrade to Professional to track up to 10,000 products.`
  };
}

export function getUpgradeMessage(plan: string = 'free'): string {
  const planLimits = getPlanLimits(plan);
  
  if (plan === 'free') {
    return `Upgrade to Professional to monitor up to 10,000 products and unlock advanced features like Slack notifications and per-product thresholds.`;
  }
  
  return `You're on the ${planLimits.name} plan with access to all features.`;
}

export function canUseFeature(plan: string = 'free', feature: keyof typeof PLAN_LIMITS.free.restrictions): boolean {
  const planLimits = getPlanLimits(plan);
  return !planLimits.restrictions[feature];
}