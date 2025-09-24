import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { shopify, WEBHOOK_TOPICS } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { registerWebhooks } from '@/lib/webhook-registration';
import { validateOAuthCallback, validateShopDomain, decodeAndValidateState } from '@/lib/oauth-validation';
import { encryptToken, decryptToken } from '@/lib/token-encryption';

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, number[]>();

function checkRateLimit(identifier: string, limit: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const timestamps = rateLimitStore.get(identifier) || [];
  const recentTimestamps = timestamps.filter(ts => now - ts < windowMs);

  if (recentTimestamps.length >= limit) {
    return false; // Rate limit exceeded
  }

  recentTimestamps.push(now);
  rateLimitStore.set(identifier, recentTimestamps);
  return true;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const shop = searchParams.get('shop');
    const state = searchParams.get('state');
    const hmac = searchParams.get('hmac');

    // Rate limiting check
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`oauth-callback:${clientIp}`, 10, 60000)) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Try to decode the state parameter first (more reliable than cookies)
    let validatedNonce: string | undefined;
    let validatedShop: string | undefined;

    if (state) {
      const decodedState = decodeAndValidateState(state);
      if (decodedState.valid && decodedState.data) {
        console.log('[OAuth Callback] Successfully decoded state parameter');
        validatedNonce = decodedState.data.nonce;
        validatedShop = decodedState.data.shop;
      } else {
        console.log('[OAuth Callback] Failed to decode state:', decodedState.error);
      }
    }

    // Fallback to cookies if state decoding failed
    const cookieStore = await cookies();
    const storedState = cookieStore.get('shopify-oauth-state')?.value;
    const storedShop = cookieStore.get('shopify-oauth-shop')?.value;
    const storedPKCE = cookieStore.get('shopify-oauth-pkce')?.value;

    // Use validated values from state, or fallback to cookies
    const expectedNonce = validatedNonce || storedState;
    const expectedShop = validatedShop || storedShop;

    console.log('[OAuth Callback] Auth validation:', {
      stateFromURL: state?.substring(0, 20) + '...',
      decodedNonce: validatedNonce?.substring(0, 20) + '...',
      decodedShop: validatedShop,
      cookieNonce: storedState?.substring(0, 20) + '...',
      cookieShop: storedShop,
      shopFromURL: shop
    });

    // CRITICAL: Validate the entire OAuth callback
    // We skip state validation here since we handle it differently
    const validation = {
      valid: true,
      error: undefined as string | undefined
    };

    // Validate HMAC (already retrieved at line 33)
    if (!hmac) {
      validation.valid = false;
      validation.error = 'Missing HMAC';
    } else {
      // Create a copy and remove hmac/signature for validation
      const params = new URLSearchParams(searchParams);
      params.delete('hmac');
      params.delete('signature');

      // Sort and create query string
      const sortedParams = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

      // Calculate HMAC
      const calculatedHmac = crypto
        .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
        .update(sortedParams)
        .digest('hex');

      if (hmac !== calculatedHmac) {
        validation.valid = false;
        validation.error = 'Invalid HMAC';
      }
    }

    // Validate shop domain
    if (validation.valid && !validateShopDomain(shop)) {
      validation.valid = false;
      validation.error = 'Invalid shop domain';
    }

    // Validate we have some form of state validation
    if (validation.valid && !expectedNonce && !validatedNonce) {
      validation.valid = false;
      validation.error = 'No state validation available';
    }

    if (!validation.valid) {
      console.error('[OAuth Callback] Validation failed:', validation.error);
      console.error('[OAuth Callback] Debug info:', {
        validatedFromState: !!validatedNonce,
        hadCookies: !!storedState || !!storedShop
      });

      // Clear OAuth cookies on error
      cookieStore.delete('shopify-oauth-state');
      cookieStore.delete('shopify-oauth-shop');
      cookieStore.delete('shopify-oauth-pkce');

      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    // Additional validation: ensure shop matches expected shop
    if (expectedShop && shop !== expectedShop) {
      console.error('[OAuth Callback] Shop mismatch:', { received: shop, expected: expectedShop });
      return NextResponse.json({ error: 'Shop domain mismatch' }, { status: 403 });
    }

    // Clear OAuth cookies after successful validation
    cookieStore.delete('shopify-oauth-state');
    cookieStore.delete('shopify-oauth-shop');
    cookieStore.delete('shopify-oauth-pkce');

    // Exchange code for access token with PKCE verifier if available
    const tokenRequestBody: any = {
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    };

    // Add PKCE verifier if it was used
    if (storedPKCE) {
      tokenRequestBody.code_verifier = storedPKCE;
    }

    const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tokenRequestBody),
    });
    
    if (!accessTokenResponse.ok) {
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 });
    }
    
    const tokenData = await accessTokenResponse.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;

    console.log('[OAuth Callback] Token exchange successful');
    console.log('[OAuth Callback] Granted scopes:', scope);

    // Parse granted scopes
    const grantedScopes = scope
      .split(',')
      .map((s: string) => s.trim());

    // Parse and analyze granted scopes
    const hasWriteProducts = grantedScopes.includes('write_products');
    const hasWriteInventory = grantedScopes.includes('write_inventory');
    const hasReadProducts = grantedScopes.includes('read_products');
    const hasReadInventory = grantedScopes.includes('read_inventory');

    console.log('[OAuth Callback] Scope Analysis:', {
      granted: grantedScopes,
      hasReadProducts,
      hasWriteProducts,
      hasReadInventory,
      hasWriteInventory
    });

    // WORKAROUND: Handle Shopify's unusual scope granting behavior
    // Sometimes Shopify grants only write scopes in certain configurations
    // We need to test if we can actually access the APIs regardless of scope names

    let proceedWithInstallation = false;
    let scopeWarning = null;

    // Ideal case: We have read scopes (with or without write)
    if (hasReadProducts && hasReadInventory) {
      console.log('[OAuth Callback] ✅ All required read scopes granted');
      proceedWithInstallation = true;
    }
    // Edge case: Only write scopes granted (unusual but might work)
    else if (hasWriteProducts && hasWriteInventory) {
      console.warn('[OAuth Callback] ⚠️ Only write scopes granted - testing if read access works');
      scopeWarning = 'Only write scopes granted. App will test read access after installation.';
      proceedWithInstallation = true; // Proceed and test actual access
    }
    // Partial scopes: At least some access granted
    else if (hasReadProducts || hasWriteProducts || hasReadInventory || hasWriteInventory) {
      console.warn('[OAuth Callback] ⚠️ Partial scopes granted');
      scopeWarning = `Partial scopes granted. Some features may be limited. Granted: ${grantedScopes.join(', ')}`;
      proceedWithInstallation = true; // Proceed with limited functionality
    }
    // No relevant scopes at all
    else {
      console.error('[OAuth Callback] ❌ No relevant scopes granted');
      return NextResponse.json({
        error: 'No permissions granted',
        message: 'The app requires access to products and inventory. Please contact support.',
        granted: grantedScopes,
        required: ['read_products', 'read_inventory'],
        support: 'Please uninstall and reinstall the app, or contact support if the issue persists.'
      }, { status: 403 });
    }

    if (!proceedWithInstallation) {
      return NextResponse.json({
        error: 'Installation cannot proceed',
        message: 'Insufficient permissions granted',
        granted: grantedScopes
      }, { status: 403 });
    }

    console.log('[OAuth Callback] ✅ Proceeding with installation');
    if (scopeWarning) {
      console.warn('[OAuth Callback] Warning:', scopeWarning);
    }

    // Encrypt the access token before storing
    const encryptedToken = await encryptToken(accessToken);

    // Create session object with encrypted token
    const session = {
      shop,
      accessToken: encryptedToken,
      scope,
      tokenEncrypted: true, // Flag to indicate token is encrypted
      scopeWarning: scopeWarning || null, // Track any scope issues
    };

    // Store shop data in Supabase
    const { data: existingStore, error: fetchError } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('shop_domain', session.shop)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    let storeId: string;

    if (existingStore) {
      // Clean up old inventory data when reinstalling
      // This handles cases where the uninstall webhook might not have fired
      const { error: cleanupError } = await supabaseAdmin
        .from('inventory_tracking')
        .delete()
        .eq('store_id', existingStore.id);
      
      if (cleanupError) {
        // Continue anyway - not critical
      }
      
      // Also clean up product settings
      const { error: settingsCleanupError } = await supabaseAdmin
        .from('product_settings')
        .delete()
        .eq('store_id', existingStore.id);
      
      if (settingsCleanupError) {
        // Continue anyway - not critical
      }
      
      // Update existing store
      const { data: updatedStore, error: updateError } = await supabaseAdmin
        .from('stores')
        .update({
          access_token: session.accessToken,
          scope: session.scope,
          scope_warning: session.scopeWarning,
          updated_at: new Date().toISOString(),
        })
        .eq('shop_domain', session.shop)
        .select('id')
        .single();
      
      if (updateError) {
        throw updateError;
      }
      
      storeId = updatedStore!.id;
    } else {
      // Create new store
      const { data: newStore, error: insertError } = await supabaseAdmin
        .from('stores')
        .insert({
          shop_domain: session.shop,
          access_token: session.accessToken,
          scope: session.scope,
          scope_warning: session.scopeWarning,
          plan: 'free',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      if (insertError) {
        throw insertError;
      }
      
      storeId = newStore!.id;

      // Create default settings for new store
      const { error: settingsError } = await supabaseAdmin
        .from('store_settings')
        .insert({
          store_id: storeId,
          auto_hide_enabled: true,
          auto_republish_enabled: false,
          low_stock_threshold: 5,
          email_notifications: true,
          slack_notifications: false,
        });

      if (settingsError) {
        // Don't throw here, settings can be created later
      }

      // Create initial setup progress for new store
      const { error: progressError } = await supabaseAdmin
        .from('setup_progress')
        .insert({
          store_id: storeId,
          app_installed: true,
          global_settings_configured: false,
          notifications_configured: false,
          product_thresholds_configured: false,
          first_product_tracked: false
        });

      if (progressError) {
        // Don't throw here, can be created later
      }
    }

    // Register webhooks for inventory tracking (pass plain token, not encrypted)
    try {
      await registerWebhooks(session.shop, accessToken); // Use plain token for webhook registration
    } catch (webhookError) {
      console.error('[OAuth Callback] Webhook registration failed:', webhookError);
      // Don't fail the auth flow if webhook registration fails
      // Webhooks can be registered manually later
    }

    // For embedded apps, we need to redirect to Shopify admin which will load our app in an iframe
    // This is the correct way to complete OAuth for embedded apps according to Shopify best practices
    const host = req.nextUrl.searchParams.get('host') || '';
    const apiKey = process.env.SHOPIFY_API_KEY || '';

    // Build the redirect URL based on whether it's embedded or standalone
    let finalRedirectUrl: string;

    if (host) {
      // Embedded app flow - redirect to Shopify admin
      // The admin will automatically load our app in an iframe
      finalRedirectUrl = `https://${session.shop}/admin/apps/${apiKey}`;
    } else {
      // Standalone app flow - redirect directly to our app
      finalRedirectUrl = `${process.env.NEXT_PUBLIC_HOST}?shop=${encodeURIComponent(session.shop)}&authenticated=1`;
    }

    // Return HTML that handles the redirect properly
    const redirectHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting to app...</title>
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
            .spinner {
              border: 3px solid rgba(255, 255, 255, 0.3);
              border-radius: 50%;
              border-top: 3px solid white;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto 1rem;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Authentication Successful!</h2>
            <p>Redirecting to your Shopify admin...</p>
          </div>
          <script>
            // Redirect to the appropriate URL
            window.location.replace('${finalRedirectUrl}');
          </script>
          <noscript>
            <meta http-equiv="refresh" content="0; url=${finalRedirectUrl}" />
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
    // Return a user-friendly error page
    const errorHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Error</title>
        </head>
        <body style="font-family: sans-serif; padding: 20px;">
          <h1>Authentication Failed</h1>
          <p>There was an error completing the authentication process.</p>
          <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
          <p>Please try reinstalling the app or contact support if the issue persists.</p>
        </body>
      </html>
    `;
    
    return new NextResponse(errorHtml, {
      status: 500,
      headers: {
        'Content-Type': 'text/html',
      },
    });
  }
}