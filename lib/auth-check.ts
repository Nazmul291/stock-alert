import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase';

export async function requireAuth(shop: string | undefined) {
  if (!shop) {
    redirect('/');
  }

  // Check if store exists in database (has completed OAuth)
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('id, access_token')
    .eq('shop_domain', shop)
    .single();
  
  // If no store or no access token, need to complete OAuth
  if (!store || !store.access_token) {
    redirect(`/api/auth?shop=${shop}&embedded=1`);
  }
  
  // For embedded apps, we don't need to check for session cookie
  // The presence of shop parameter and valid store in DB is enough
  // Session cookies don't work well with embedded apps due to iframe restrictions
  
  return {
    id: store.id,
    access_token: store.access_token,
    shop_domain: shop
  };
}