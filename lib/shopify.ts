import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import jwt from 'jsonwebtoken';

export const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || '38a870cdc7f41175fd49a52689539f9d',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || '',
  scopes: (process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory').split(','),
  hostName: (process.env.SHOPIFY_APP_URL || 'https://dev.nazmulcodes.org').replace(/https?:\/\//, ''),
  apiVersion: ApiVersion.July25,
  isEmbeddedApp: true,
  logger: {
    level: process.env.NODE_ENV === 'development' ? 0 : 2,
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
  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state: '',
    isOnline: false,
    accessToken,
  });

  return new shopify.clients.Rest({ session });
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