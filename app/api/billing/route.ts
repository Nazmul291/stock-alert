import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {

  try {
    // Parse request body with proper error handling for production environments
    let plan;
    try {
      const body = await req.json();
      plan = body.plan;
    } catch (parseError) {
      // This catches "Unexpected end of JSON input" errors when body is empty/malformed
      console.error('Failed to parse request body:', parseError);
      return NextResponse.json({
        error: 'Invalid request body. Please ensure you are sending valid JSON.'
      }, { status: 400 });
    }

    if (!plan) {
      return NextResponse.json({
        error: 'Plan parameter is required'
      }, { status: 400 });
    }
    const sessionToken = req.cookies.get('shopify-session')?.value;
    // Ensure NEXT_PUBLIC_HOST is set in production environment (required for Shopify redirect URLs)
    const host = process.env.NEXT_PUBLIC_HOST;

    if (!host) {
      console.error('NEXT_PUBLIC_HOST is not set in environment variables');
      return NextResponse.json({
        error: 'Server configuration error: NEXT_PUBLIC_HOST environment variable is missing'
      }, { status: 500 });
    }

    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = verifySessionToken(sessionToken);
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { shop, accessToken } = session;

    // Get store from database with proper error handling
    let store;
    try {
      const { data, error } = await supabaseAdmin
        .from('stores')
        .select('*')
        .eq('shop_domain', shop)
        .single();

      if (error) {
        console.error('Database error fetching store:', error);
        return NextResponse.json({
          error: `Database error: ${error.message}`
        }, { status: 500 });
      }

      store = data;
    } catch (dbError: any) {
      console.error('Failed to fetch store:', dbError);
      return NextResponse.json({
        error: `Failed to fetch store: ${dbError.message}`
      }, { status: 500 });
    }

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    let client;
    try {
      client = await getShopifyClient(shop, accessToken);
    } catch (clientError: any) {
      console.error('Failed to create Shopify client:', clientError);
      return NextResponse.json({
        error: `Failed to create Shopify client: ${clientError.message}`
      }, { status: 500 });
    }


    if (plan === 'pro') {
      // Create recurring charge for Pro plan
      let recurringCharge;
      try {
        recurringCharge = await client.post({
          path: 'recurring_application_charges',
          data: {
            recurring_application_charge: {
              name: 'Stock Alert Pro',
              price: 9.99,
              return_url: `${host}/api/billing/callback?shop=${shop}`,
              test: true,
              trial_days: 7,
              capped_amount: 9.99,
              terms: 'Pro features including Slack notifications, per-product thresholds, and priority support',
            },
          },
        });
      } catch (billingError: any) {
        return NextResponse.json({ 
          error: `Failed to create billing charge: ${billingError.message || 'Unknown error'}` 
        }, { status: 500 });
      }

      const charge = recurringCharge.body.recurring_application_charge;

      // Store charge info in database
      try {
        const { error: insertError } = await supabaseAdmin
          .from('billing_records')
          .insert({
            store_id: store.id,
            charge_id: charge.id,
            plan: 'pro',
            status: 'pending',
            amount: 9.99,
            currency: 'USD',
          });

        if (insertError) {
          console.error('Failed to insert billing record:', insertError);
          // Continue anyway - the charge was created successfully
        }
      } catch (dbInsertError: any) {
        console.error('Database insert error:', dbInsertError);
        // Continue anyway - the charge was created successfully
      }

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
        try {
          // Try to cancel the recurring charge
          await client.delete({
            path: `recurring_application_charges/${billingRecord.charge_id}`,
          });
        } catch (cancelError) {
          // Continue anyway - charge might not exist or be a test charge
        }

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
        .update({ 
          plan: 'free',
          updated_at: new Date().toISOString()
        })
        .eq('id', store.id);

      return NextResponse.json({ 
        success: true,
        message: 'Successfully downgraded to free plan'
      });
    }

    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  } catch (error: any) {
    // Comprehensive error logging for debugging production issues
    console.error('Billing route error:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({
      error: `Internal server error: ${error.message || 'Unknown error occurred'}`
    }, { status: 500 });
  }
}