import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {

  try {
    // Parse request body with proper error handling for production environments
    let plan;
    let bodyText = '';

    try {
      const body = await req.json();
      plan = body.plan;
    } catch (parseError: any) {
      return NextResponse.json({
        error: 'Invalid request body. Please ensure you are sending valid JSON.'
      }, { status: 400 });
    }

    if (!plan) {
      console.error('[BILLING] No plan parameter provided');
      return NextResponse.json({
        error: 'Plan parameter is required'
      }, { status: 400 });
    }

    const sessionToken = req.cookies.get('shopify-session')?.value;
    console.error('[BILLING] Session token exists:', !!sessionToken);

    // Ensure NEXT_PUBLIC_HOST is set in production environment (required for Shopify redirect URLs)
    const host = process.env.NEXT_PUBLIC_HOST;
    console.error('[BILLING] NEXT_PUBLIC_HOST:', host);

    if (!host) {
      console.error('[BILLING] ERROR: NEXT_PUBLIC_HOST is not set in environment variables');
      return NextResponse.json({
        error: 'Server configuration error: NEXT_PUBLIC_HOST environment variable is missing'
      }, { status: 500 });
    }

    if (!sessionToken) {
      console.error('[BILLING] ERROR: No session token found');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = verifySessionToken(sessionToken);
    console.error('[BILLING] Session verified:', !!session);

    if (!session) {
      console.error('[BILLING] ERROR: Invalid session token');
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { shop, accessToken } = session;
    console.error('[BILLING] Shop:', shop);

    // Get store from database with proper error handling
    let store;
    console.error('[BILLING] Fetching store from database for shop:', shop);

    try {
      const { data, error } = await supabaseAdmin
        .from('stores')
        .select('*')
        .eq('shop_domain', shop)
        .single();

      console.error('[BILLING] Database query completed. Error:', error, 'Data:', data ? 'Found' : 'Not found');

      if (error) {
        console.error('[BILLING] Database error fetching store:', error);
        console.error('[BILLING] Error details:', JSON.stringify(error, null, 2));
        return NextResponse.json({
          error: `Database error: ${error.message}`
        }, { status: 500 });
      }

      store = data;
      console.error('[BILLING] Store found with ID:', store?.id);
    } catch (dbError: any) {
      console.error('[BILLING] Exception while fetching store:', dbError);
      console.error('[BILLING] Exception message:', dbError.message);
      console.error('[BILLING] Exception stack:', dbError.stack);
      return NextResponse.json({
        error: `Failed to fetch store: ${dbError.message}`
      }, { status: 500 });
    }

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    let client;
    console.error('[BILLING] Creating Shopify client for shop:', shop);

    try {
      client = await getShopifyClient(shop, accessToken);
      console.error('[BILLING] Shopify client created successfully');
    } catch (clientError: any) {
      console.error('[BILLING] Failed to create Shopify client:', clientError);
      console.error('[BILLING] Client error message:', clientError.message);
      console.error('[BILLING] Client error stack:', clientError.stack);
      return NextResponse.json({
        error: `Failed to create Shopify client: ${clientError.message}`
      }, { status: 500 });
    }


    if (plan === 'pro') {
      console.error('[BILLING] Processing PRO plan upgrade');

      // Create recurring charge for Pro plan
      let recurringCharge;
      try {
        console.error('[BILLING] Creating recurring charge with Shopify API');
        console.error('[BILLING] Using shop:', shop);
        console.error('[BILLING] Return URL:', `${host}/api/billing/callback?shop=${shop}`);

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

        console.error('[BILLING] Shopify API response received');
        console.error('[BILLING] Response body type:', typeof recurringCharge?.body);
        console.error('[BILLING] Response body keys:', recurringCharge?.body ? Object.keys(recurringCharge.body) : 'No body');

      } catch (billingError: any) {
        console.error('[BILLING] Shopify API error:', billingError.message);
        console.error('[BILLING] Error details:', JSON.stringify(billingError, null, 2));
        return NextResponse.json({
          error: `Failed to create billing charge: ${billingError.message || 'Unknown error'}`
        }, { status: 500 });
      }

      if (!recurringCharge?.body?.recurring_application_charge) {
        console.error('[BILLING] Invalid Shopify response structure');
        console.error('[BILLING] Full response:', JSON.stringify(recurringCharge?.body, null, 2));
        return NextResponse.json({
          error: 'Invalid response from Shopify API'
        }, { status: 500 });
      }

      const charge = recurringCharge.body.recurring_application_charge;
      console.error('[BILLING] Charge created with ID:', charge.id);
      console.error('[BILLING] Confirmation URL:', charge.confirmation_url);

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
    console.error('[BILLING] FATAL ERROR:', error);
    console.error('[BILLING] Error message:', error.message);
    console.error('[BILLING] Error stack:', error.stack);
    console.error('[BILLING] Error name:', error.name);
    console.error('[BILLING] Full error object:', JSON.stringify(error, null, 2));

    return NextResponse.json({
      error: `Internal server error: ${error.message || 'Unknown error occurred'}`,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}