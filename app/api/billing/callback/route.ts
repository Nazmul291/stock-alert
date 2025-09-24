import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';

// Validate HMAC for billing callback
function validateBillingHMAC(searchParams: URLSearchParams, secret: string): boolean {
  const hmac = searchParams.get('hmac');
  if (!hmac) return false;

  // Create a copy of params and remove hmac
  const params = new URLSearchParams(searchParams);
  params.delete('hmac');
  params.delete('signature'); // Also remove signature if present

  // Sort parameters and create query string
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  // Calculate HMAC
  const calculatedHmac = crypto
    .createHmac('sha256', secret)
    .update(sortedParams)
    .digest('hex');

  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(hmac, 'hex'),
    Buffer.from(calculatedHmac, 'hex')
  );
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const shop = searchParams.get('shop');
  const chargeId = searchParams.get('charge_id');
  const host = searchParams.get('host');
  const hmac = searchParams.get('hmac');

  try {
    // Validate HMAC if present (Shopify includes it in billing callbacks)
    if (hmac) {
      const isValid = validateBillingHMAC(searchParams, process.env.SHOPIFY_API_SECRET!);
      if (!isValid) {
        console.error('[BILLING CALLBACK] Invalid HMAC signature');
        return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 403 });
      }
      console.log('[BILLING CALLBACK] HMAC validation successful');
    } else {
      console.warn('[BILLING CALLBACK] No HMAC provided - proceeding with caution');
    }
    if (!shop || !chargeId) {
      console.error('[BILLING CALLBACK] Missing required parameters');
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Validate shop domain format
    const shopRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
    if (!shopRegex.test(shop)) {
      console.error('[BILLING CALLBACK] Invalid shop domain format:', shop);
      return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 });
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

    // First, verify the charge exists and is in the correct state
    let chargeDetails;
    try {
      const chargeCheckResponse = await client.get({
        path: `recurring_application_charges/${chargeId}`,
      });
      chargeDetails = chargeCheckResponse.body.recurring_application_charge;

      // Verify the charge is pending activation
      if (chargeDetails.status !== 'accepted') {
        console.error('[BILLING CALLBACK] Charge not in accepted state:', chargeDetails.status);
        return NextResponse.json({
          error: 'Charge not ready for activation',
          status: chargeDetails.status
        }, { status: 400 });
      }
    } catch (error) {
      console.error('[BILLING CALLBACK] Failed to verify charge:', error);
      return NextResponse.json({ error: 'Failed to verify charge' }, { status: 500 });
    }

    // Activate the charge
    const chargeResponse = await client.post({
      path: `recurring_application_charges/${chargeId}/activate`,
      data: {},
    });

    const charge = chargeResponse.body.recurring_application_charge;

    // Update billing record
    const { error: billingUpdateError } = await supabaseAdmin
      .from('billing_records')
      .update({
        status: 'active',
        activated_on: new Date().toISOString(),
        billing_on: charge.billing_on,
        confirmation_url: charge.confirmation_url,
        updated_at: new Date().toISOString()
      })
      .eq('charge_id', parseInt(chargeId));

    if (billingUpdateError) {
      console.error('[BILLING CALLBACK] Failed to update billing record:', billingUpdateError);
    }

    // Update store plan
    const { error: storeUpdateError } = await supabaseAdmin
      .from('stores')
      .update({
        plan: 'pro',
        updated_at: new Date().toISOString()
      })
      .eq('id', store.id);

    if (storeUpdateError) {
      console.error('[BILLING CALLBACK] Failed to update store plan:', storeUpdateError);
    }

    console.log('[BILLING CALLBACK] Successfully activated subscription for shop:', shop);

    // For embedded apps, redirect to Shopify admin
    // For standalone, redirect to dashboard
    let redirectUrl: string;

    if (host) {
      // Embedded app - redirect to Shopify admin
      const apiKey = process.env.SHOPIFY_API_KEY || '';
      redirectUrl = `https://${shop}/admin/apps/${apiKey}/dashboard?billing=success`;
    } else {
      // Standalone app - redirect to dashboard
      const appUrl = new URL('/dashboard', process.env.NEXT_PUBLIC_HOST);
      appUrl.searchParams.set('shop', shop);
      appUrl.searchParams.set('billing', 'success');
      redirectUrl = appUrl.toString();
    }
    // Use HTML redirect for better compatibility with embedded apps
    const redirectHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Subscription Activated</title>
          <meta charset="utf-8" />
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            .checkmark {
              width: 56px;
              height: 56px;
              border-radius: 50%;
              display: block;
              stroke-width: 2;
              stroke: #fff;
              stroke-miterlimit: 10;
              margin: 0 auto 1rem;
              box-shadow: inset 0px 0px 0px #7ac142;
              animation: fill .4s ease-in-out .4s forwards, scale .3s ease-in-out .9s both;
            }
            .checkmark__circle {
              stroke-dasharray: 166;
              stroke-dashoffset: 166;
              stroke-width: 2;
              stroke-miterlimit: 10;
              stroke: #7ac142;
              fill: none;
              animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
            }
            .checkmark__check {
              transform-origin: 50% 50%;
              stroke-dasharray: 48;
              stroke-dashoffset: 48;
              animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
            }
            @keyframes stroke {
              100% { stroke-dashoffset: 0; }
            }
            @keyframes scale {
              0%, 100% { transform: none; }
              50% { transform: scale3d(1.1, 1.1, 1); }
            }
            @keyframes fill {
              100% { box-shadow: inset 0px 0px 0px 30px #7ac142; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
              <circle class="checkmark__circle" cx="26" cy="26" r="25" fill="none"/>
              <path class="checkmark__check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
            <h2>Subscription Activated!</h2>
            <p>Redirecting to your dashboard...</p>
          </div>
          <script>
            setTimeout(function() {
              window.location.replace('${redirectUrl}');
            }, 1500);
          </script>
          <noscript>
            <meta http-equiv="refresh" content="2; url=${redirectUrl}" />
          </noscript>
        </body>
      </html>
    `;

    return new NextResponse(redirectHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  } catch (error) {
    console.error('[BILLING CALLBACK] Error processing billing callback:', error);

    // Build error redirect URL
    const shop = searchParams.get('shop') || '';
    const host = searchParams.get('host');
    let errorRedirectUrl: string;

    if (host) {
      // Embedded app - redirect to Shopify admin
      const apiKey = process.env.SHOPIFY_API_KEY || '';
      errorRedirectUrl = `https://${shop}/admin/apps/${apiKey}/billing?error=billing_failed`;
    } else {
      // Standalone app
      const appUrl = new URL('/billing', process.env.NEXT_PUBLIC_HOST);
      appUrl.searchParams.set('shop', shop);
      appUrl.searchParams.set('error', 'billing_failed');
      errorRedirectUrl = appUrl.toString();
    }

    // Return error page with redirect
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Billing Error</title>
          <meta charset="utf-8" />
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #f5576c 0%, #f093fb 100%);
              color: white;
            }
            .container { text-align: center; padding: 2rem; }
            .error-icon {
              font-size: 48px;
              margin-bottom: 1rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error-icon">⚠️</div>
            <h2>Billing Activation Failed</h2>
            <p>There was an error activating your subscription.</p>
            <p>Redirecting back to billing page...</p>
          </div>
          <script>
            setTimeout(function() {
              window.location.replace('${errorRedirectUrl}');
            }, 3000);
          </script>
          <noscript>
            <meta http-equiv="refresh" content="3; url=${errorRedirectUrl}" />
          </noscript>
        </body>
      </html>
    `;

    return new NextResponse(errorHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
}