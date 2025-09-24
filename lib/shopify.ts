import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';

export interface ShopifyResponse {
  body: any;
}

// Validate required environment variables
const apiSecret = process.env.SHOPIFY_API_SECRET;
if (!apiSecret) {
  console.error('[SHOPIFY_CONFIG] WARNING: SHOPIFY_API_SECRET is not set!');
}

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || '38a870cdc7f41175fd49a52689539f9d',
  apiSecretKey: apiSecret || 'dummy-secret-for-development',  // Provide fallback to prevent empty string
  scopes: (process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory').split(','),
  hostName: (process.env.SHOPIFY_APP_URL || 'https://stock-alert.nazmulcodes.org').replace(/https?:\/\//, ''),
  apiVersion: ApiVersion.October24, // Latest stable API version (2024-10)
  isEmbeddedApp: true,
  logger: {
    level: process.env.NODE_ENV === 'development' ? 0 : 3, // Set to 3 (ERROR) to suppress INFO messages
  },
  future: {
    lineItemBilling: false, // Explicitly set to false to suppress the warning
    customerAddressDefaultFix: false,
    unstable_managedPricingSupport: false,
  },
});


export async function getShopifyClient(shop: string, accessToken: string) {
  // Import token decryption
  const { decryptToken, isEncryptedToken } = await import('@/lib/token-encryption');

  // Validate inputs
  if (!shop || !accessToken) {
    throw new Error(`Invalid shop or accessToken: shop=${shop}, token exists=${!!accessToken}`);
  }

  // Decrypt token if it's encrypted
  let actualToken = accessToken;
  if (isEncryptedToken(accessToken)) {
    try {
      actualToken = await decryptToken(accessToken);
    } catch (error) {
      console.error('[Shopify Client] Failed to decrypt token:', error);
      throw new Error('Failed to decrypt access token');
    }
  }

  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state: '',
    isOnline: false,
    accessToken: actualToken,
  });

  const client = new shopify.clients.Rest({ session });

  return client;
}

export async function getGraphQLClient(shop: string, accessToken: string) {
  // Import token decryption
  const { decryptToken, isEncryptedToken } = await import('@/lib/token-encryption');

  // Validate inputs
  if (!shop || !accessToken) {
    throw new Error(`Invalid shop or accessToken: shop=${shop}, token exists=${!!accessToken}`);
  }

  // Decrypt token if it's encrypted
  let actualToken = accessToken;
  if (isEncryptedToken(accessToken)) {
    try {
      actualToken = await decryptToken(accessToken);
    } catch (error) {
      console.error('[GraphQL Client] Failed to decrypt token:', error);
      throw new Error('Failed to decrypt access token');
    }
  }

  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state: '',
    isOnline: false,
    accessToken: actualToken,
  });

  return new shopify.clients.Graphql({ session });
}

export const WEBHOOK_TOPICS = {
  INVENTORY_LEVELS_UPDATE: 'inventory_levels/update',
  PRODUCTS_UPDATE: 'products/update',
  PRODUCTS_DELETE: 'products/delete',
  APP_UNINSTALLED: 'app/uninstalled',
} as const;