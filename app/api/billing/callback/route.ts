import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  const chargeId = searchParams.get('charge_id');
  
  try {
    
    if (!shop || !chargeId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Get store from database
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const client = await getShopifyClient(shop, store.access_token);

    // Activate the charge
    const chargeResponse = await client.post({
      path: `recurring_application_charges/${chargeId}/activate`,
      data: {},
    });

    const charge = chargeResponse.body.recurring_application_charge;

    // Update billing record
    await supabaseAdmin
      .from('billing_records')
      .update({
        status: 'active',
        activated_on: new Date().toISOString(),
        billing_on: charge.billing_on,
      })
      .eq('charge_id', parseInt(chargeId));

    // Update store plan
    await supabaseAdmin
      .from('stores')
      .update({ plan: 'pro' })
      .eq('id', store.id);

    // Redirect to settings page with success message
    const redirectUrl = new URL('/settings', process.env.NEXT_PUBLIC_HOST);
    redirectUrl.searchParams.set('shop', shop);
    redirectUrl.searchParams.set('billing', 'success');

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Billing callback error:', error);
    
    // Redirect to settings page with error message
    const redirectUrl = new URL('/settings', process.env.NEXT_PUBLIC_HOST);
    redirectUrl.searchParams.set('shop', searchParams.get('shop') || '');
    redirectUrl.searchParams.set('billing', 'error');

    return NextResponse.redirect(redirectUrl);
  }
}