import { headers, cookies } from 'next/headers';
import { supabaseAdmin } from './supabase';
import { redirect } from 'next/navigation';

export interface ShopifySession {
  shop: string;
  accessToken: string;
  storeId: string;
}

/**
 * Server-side function to get the current Shopify session
 * Can only be used in Server Components or Server Actions
 */
export async function getServerSession(): Promise<ShopifySession | null> {
  const headersList = await headers();
  const shop = headersList.get('x-shopify-shop');
  
  if (!shop) {
    return null;
  }

  // Get store from database
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id, access_token')
    .eq('shop_domain', shop)
    .single();

  if (!store) {
    return null;
  }

  return {
    shop,
    accessToken: store.access_token,
    storeId: store.id,
  };
}

/**
 * Server-side function to require authentication
 * Redirects to auth if not authenticated
 */
export async function requireAuth(): Promise<ShopifySession> {
  const session = await getServerSession();
  
  if (!session) {
    // Try to get shop from headers (set by middleware)
    const headersList = await headers();
    const shop = headersList.get('x-shopify-shop');
    
    if (shop) {
      // Get store from database
      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, access_token')
        .eq('shop_domain', shop)
        .single();

      if (store) {
        return {
          shop,
          accessToken: store.access_token,
          storeId: store.id,
        };
      }
    }
    
    redirect('/');
  }
  
  return session;
}

/**
 * Get store settings from database
 */
export async function getStoreSettings(storeId: string) {
  const { data: settings } = await supabaseAdmin
    .from('store_settings')
    .select('*')
    .eq('store_id', storeId)
    .single();

  return settings;
}

/**
 * Get store details from database
 */
export async function getStore(shop: string) {
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('shop_domain', shop)
    .single();

  return store;
}