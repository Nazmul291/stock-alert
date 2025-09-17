import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import jwt from 'jsonwebtoken';

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

export function generateSessionToken(shop: string, accessToken: string): string {
  return jwt.sign(
    {
      shop,
      accessToken,
      iat: Math.floor(Date.now() / 1000),
    },
    process.env.JWT_SECRET || 'default-jwt-secret-change-in-production',
    { expiresIn: '7d' }
  );
}

export function verifySessionToken(token: string): { shop: string; accessToken: string } | null {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-jwt-secret-change-in-production') as any;
    return {
      shop: decoded.shop,
      accessToken: decoded.accessToken,
    };
  } catch (error) {
    return null;
  }
}

export async function getShopifyClient(shop: string, accessToken: string) {
  // Validate inputs
  if (!shop || !accessToken) {
    throw new Error(`Invalid shop or accessToken: shop=${shop}, token exists=${!!accessToken}`);
  }

  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state: '',
    isOnline: false,
    accessToken,
  });

  const client = new shopify.clients.Rest({ session });

  // Log the client configuration for debugging
  console.error('[SHOPIFY_CLIENT] Created REST client for shop:', shop);
  console.error('[SHOPIFY_CLIENT] Session accessToken exists:', !!accessToken);
  console.error('[SHOPIFY_CLIENT] API Version:', shopify.config.apiVersion);
  console.error('[SHOPIFY_CLIENT] Access token first 10 chars:', accessToken.substring(0, 10));

  // Wrap the client.post method to catch raw responses
  const originalPost = client.post.bind(client);

  client.post = async function(options: any) {
    console.error('[SHOPIFY_CLIENT] Making POST request to:', options.path);
    console.error('[SHOPIFY_CLIENT] POST data keys:', options.data ? Object.keys(options.data) : 'No data');

    try {
      // Make a direct fetch call to see raw response
      const apiUrl = `https://${shop}/admin/api/2024-10/${options.path}`;
      console.error('[SHOPIFY_CLIENT] Direct fetch to:', apiUrl);

      const fetchResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(options.data),
      });

      console.error('[SHOPIFY_CLIENT] Fetch response status:', fetchResponse.status);
      console.error('[SHOPIFY_CLIENT] Fetch response statusText:', fetchResponse.statusText);

      const responseText = await fetchResponse.text();
      console.error('[SHOPIFY_CLIENT] Response text length:', responseText.length);
      console.error('[SHOPIFY_CLIENT] Response text (first 1000 chars):', responseText.substring(0, 1000));

      // Now try the original SDK method
      console.error('[SHOPIFY_CLIENT] Now trying SDK post method...');
    } catch (fetchError: any) {
      console.error('[SHOPIFY_CLIENT] Direct fetch error:', fetchError.message);
    }

    // Call original post
    try {
      const response = await originalPost(options);
      console.error('[SHOPIFY_CLIENT] SDK POST successful');
      console.error('[SHOPIFY_CLIENT] Response body exists:', !!response?.body);
      console.error('[SHOPIFY_CLIENT] Response body type:', typeof response?.body);
      return response;
    } catch (error: any) {
      console.error('[SHOPIFY_CLIENT] SDK POST failed');
      console.error('[SHOPIFY_CLIENT] Error type:', error.constructor.name);
      console.error('[SHOPIFY_CLIENT] Error message:', error.message);
      console.error('[SHOPIFY_CLIENT] Error stack (first 500):', error.stack?.substring(0, 500));
      throw error;
    }
  };

  return client;
}

export async function getGraphQLClient(shop: string, accessToken: string) {
  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state: '',
    isOnline: false,
    accessToken,
  });

  return new shopify.clients.Graphql({ session });
}

export const WEBHOOK_TOPICS = {
  INVENTORY_LEVELS_UPDATE: 'inventory_levels/update',
  PRODUCTS_UPDATE: 'products/update',
  PRODUCTS_DELETE: 'products/delete',
  APP_UNINSTALLED: 'app/uninstalled',
} as const;