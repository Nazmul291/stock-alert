import { NextRequest, NextResponse } from 'next/server';
import { shopify, verifySessionToken, getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { plan } = await req.json();
    const sessionToken = req.cookies.get('shopify-session')?.value;
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = verifySessionToken(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { shop, accessToken } = session;

    // Get store from database
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const client = await getShopifyClient(shop, accessToken);

    if (plan === 'pro') {
      // Create recurring charge for Pro plan
      const recurringCharge = await client.post({
        path: 'recurring_application_charges',
        data: {
          recurring_application_charge: {
            name: 'Stock Alert Pro',
            price: 9.99,
            return_url: `${process.env.NEXT_PUBLIC_HOST}/api/billing/callback?shop=${shop}`,
            test: process.env.NODE_ENV === 'development',
            trial_days: 7,
            capped_amount: 9.99,
            terms: 'Pro features including Slack notifications, per-product thresholds, and priority support',
          },
        },
      });

      const charge = recurringCharge.body.recurring_application_charge;
      
      // Store charge info in database
      await supabaseAdmin
        .from('billing_records')
        .insert({
          store_id: store.id,
          charge_id: charge.id,
          plan: 'pro',
          status: 'pending',
          amount: 9.99,
          currency: 'USD',
        });

      return NextResponse.json({ 
        confirmation_url: charge.confirmation_url 
      });
    } else if (plan === 'free') {
      // Downgrade to free plan (cancel existing charge if any)
      const { data: billingRecord } = await supabaseAdmin
        .from('billing_records')
        .select('*')
        .eq('store_id', store.id)
        .eq('status', 'active')
        .single();

      if (billingRecord && billingRecord.charge_id) {
        // Cancel the recurring charge
        await client.delete({
          path: `recurring_application_charges/${billingRecord.charge_id}`,
        });

        // Update billing record
        await supabaseAdmin
          .from('billing_records')
          .update({
            status: 'cancelled',
            cancelled_on: new Date().toISOString(),
          })
          .eq('id', billingRecord.id);
      }

      // Update store plan
      await supabaseAdmin
        .from('stores')
        .update({ plan: 'free' })
        .eq('id', store.id);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  } catch (error) {
    console.error('Billing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}