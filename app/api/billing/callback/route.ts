import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  console.log('🟢 BILLING CALLBACK START');
  console.log('URL:', req.url);
  console.log('Method:', req.method);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  const searchParams = req.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  const chargeId = searchParams.get('charge_id');
  const host = searchParams.get('host');
  
  console.log('📝 Callback params:', { shop, chargeId, host });
  console.log('All search params:', Object.fromEntries(searchParams.entries()));
  
  try {
    
    if (!shop || !chargeId) {
      console.log('❌ Missing required parameters');
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

    console.log('💳 Activating charge:', chargeId);
    
    // Activate the charge
    const chargeResponse = await client.post({
      path: `recurring_application_charges/${chargeId}/activate`,
      data: {},
    });

    const charge = chargeResponse.body.recurring_application_charge;
    console.log('✅ Charge activated:', {
      id: charge.id,
      status: charge.status,
      billing_on: charge.billing_on
    });

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

    // Redirect to dashboard with success message
    const redirectUrl = new URL('/dashboard', process.env.NEXT_PUBLIC_HOST);
    redirectUrl.searchParams.set('shop', shop);
    if (host) redirectUrl.searchParams.set('host', host);
    redirectUrl.searchParams.set('upgraded', 'true');

    console.log('🚀 Redirecting to:', redirectUrl.toString());
    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Billing callback error:', error);
    
    // Redirect to billing page with error message
    const redirectUrl = new URL('/billing', process.env.NEXT_PUBLIC_HOST);
    redirectUrl.searchParams.set('shop', searchParams.get('shop') || '');
    if (host) redirectUrl.searchParams.set('host', host);
    redirectUrl.searchParams.set('error', 'billing_failed');

    return NextResponse.redirect(redirectUrl);
  }
}