import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionTokenFromRequest, getShopFromToken } from '@/lib/session-token';

export async function GET(req: NextRequest) {
  try {
    // First, try to validate the Shopify session token from the Authorization header
    const sessionToken = await getSessionTokenFromRequest(req);

    if (sessionToken) {
      // Valid session token - extract shop from it
      const shop = getShopFromToken(sessionToken);

      // Verify store exists in database
      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, access_token, plan')
        .eq('shop_domain', shop)
        .single();

      if (store && store.access_token) {
        return NextResponse.json({
          authenticated: true,
          shop,
          storeId: store.id,
          plan: store.plan || 'free',
          hasToken: true,
          sessionValid: true,
        });
      }
    }

    // Fallback: Check by shop parameter (for initial load or non-embedded context)
    const searchParams = req.nextUrl.searchParams;
    const shop = searchParams.get('shop');

    if (shop) {
      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, access_token, plan')
        .eq('shop_domain', shop)
        .single();

      if (store && store.access_token) {
        return NextResponse.json({
          authenticated: true,
          shop,
          storeId: store.id,
          plan: store.plan || 'free',
          hasToken: true,
          sessionValid: false, // No valid session token, just shop param
        });
      }
    }

    return NextResponse.json({ authenticated: false });
  } catch (error) {
    console.error('Auth verification error:', error);
    return NextResponse.json({ authenticated: false });
  }
}