/**
 * App Configuration
 * Manages scopes and feature flags
 */

export const APP_CONFIG = {
  // Plan limits
  plans: {
    free: {
      maxProducts: 10,
      features: ['email_notifications', 'basic_tracking']
    },
    pro: {
      maxProducts: -1, // unlimited
      features: ['email_notifications', 'slack_notifications', 'auto_hide', 'auto_republish', 'advanced_tracking']
    },

    // Get plan limits
    getMaxProducts: (plan: string): number => {
      return APP_CONFIG.plans[plan as keyof typeof APP_CONFIG.plans]?.maxProducts || 10;
    },

    // Check if feature is available for plan
    hasFeature: (plan: string, feature: string): boolean => {
      const planConfig = APP_CONFIG.plans[plan as keyof typeof APP_CONFIG.plans];
      return planConfig?.features.includes(feature) || false;
    }
  },

  // Scope configuration
  scopes: {
    // Essential scopes - app cannot function without these
    essential: [
      'read_products',
      'read_inventory'
    ],

    // Enhanced scopes - enable additional features
    enhanced: [
      'write_products',  // For auto-hide/republish features
      'write_inventory'  // For future inventory management features
    ],

    // Get all requested scopes
    getAllRequested: () => {
      // Check environment variable for override
      if (process.env.SHOPIFY_SCOPES) {
        return process.env.SHOPIFY_SCOPES;
      }

      // Default: request all scopes
      return [...APP_CONFIG.scopes.essential, ...APP_CONFIG.scopes.enhanced].join(',');
    },

    // Get minimal scopes (for testing)
    getMinimal: () => {
      return APP_CONFIG.scopes.essential.join(',');
    }
  },

  // Feature flags based on available scopes
  features: {
    // Check if a feature is available based on granted scopes
    isAvailable: (feature: string, grantedScopes: string[]): boolean => {
      switch (feature) {
        case 'VIEW_PRODUCTS':
          // Write scopes include read permissions in Shopify
          return grantedScopes.includes('read_products') || grantedScopes.includes('write_products');

        case 'VIEW_INVENTORY':
          // Write scopes include read permissions in Shopify
          return grantedScopes.includes('read_inventory') || grantedScopes.includes('write_inventory');

        case 'AUTO_HIDE_PRODUCTS':
          return grantedScopes.includes('write_products');

        case 'AUTO_REPUBLISH_PRODUCTS':
          return grantedScopes.includes('write_products');

        case 'MANAGE_INVENTORY':
          return grantedScopes.includes('write_inventory');

        default:
          return false;
      }
    },

    // Get list of available features
    getAvailable: (grantedScopes: string[]): string[] => {
      const features = [];

      if (APP_CONFIG.features.isAvailable('VIEW_PRODUCTS', grantedScopes)) {
        features.push('View Products');
      }
      if (APP_CONFIG.features.isAvailable('VIEW_INVENTORY', grantedScopes)) {
        features.push('Track Inventory');
      }
      if (APP_CONFIG.features.isAvailable('AUTO_HIDE_PRODUCTS', grantedScopes)) {
        features.push('Auto-hide Out of Stock');
      }
      if (APP_CONFIG.features.isAvailable('AUTO_REPUBLISH_PRODUCTS', grantedScopes)) {
        features.push('Auto-republish When Back');
      }

      return features;
    }
  },

  // Validation
  validation: {
    // Check if app can function with granted scopes
    canFunction: (grantedScopes: string[]): boolean => {
      const hasProducts = APP_CONFIG.features.isAvailable('VIEW_PRODUCTS', grantedScopes);
      const hasInventory = APP_CONFIG.features.isAvailable('VIEW_INVENTORY', grantedScopes);

      return hasProducts && hasInventory;
    },

    // Get missing essential scopes
    getMissingEssential: (grantedScopes: string[]): string[] => {
      // Each scope is required individually - write scopes don't substitute for read scopes
      return APP_CONFIG.scopes.essential.filter(
        scope => !grantedScopes.includes(scope)
      );
    }
  }
};

export default APP_CONFIG;