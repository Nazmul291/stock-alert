import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  
  if (!shop) {
    return NextResponse.json({ authenticated: false });
  }
  
  try {
    // Check if store exists in database
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
      });
    }
    
    return NextResponse.json({ authenticated: false });
  } catch (error) {
    console.error('Auth verification error:', error);
    return NextResponse.json({ authenticated: false });
  }
}