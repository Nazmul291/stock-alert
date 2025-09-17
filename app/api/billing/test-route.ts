import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

// This is a temporary solution for development testing
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

    const { shop } = session;

    // Get store from database
    const { data: store, error } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', shop)
      .single();

    if (error || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    if (plan === 'pro') {
      // For development, directly update the store to pro without Shopify billing
      await supabaseAdmin
        .from('stores')
        .update({
          plan: 'pro',
          updated_at: new Date().toISOString()
        })
        .eq('id', store.id);

      // Create a mock billing record
      await supabaseAdmin
        .from('billing_records')
        .insert({
          store_id: store.id,
          charge_id: 999999, // Mock charge ID
          plan: 'pro',
          status: 'active',
          amount: 9.99,
          currency: 'USD',
          activated_on: new Date().toISOString(),
        });

      return NextResponse.json({
        success: true,
        message: 'Development mode: Store upgraded to Pro without billing',
        plan: 'pro'
      });
    } else if (plan === 'free') {
      // Downgrade to free plan
      await supabaseAdmin
        .from('stores')
        .update({
          plan: 'free',
          updated_at: new Date().toISOString()
        })
        .eq('id', store.id);

      // Update billing record
      await supabaseAdmin
        .from('billing_records')
        .update({
          status: 'cancelled',
          cancelled_on: new Date().toISOString(),
        })
        .eq('store_id', store.id)
        .eq('status', 'active');

      return NextResponse.json({
        success: true,
        message: 'Successfully downgraded to free plan',
        plan: 'free'
      });
    }

    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  } catch (error) {
    console.error('Test billing error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}