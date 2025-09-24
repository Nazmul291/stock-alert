import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { shopify, WEBHOOK_TOPICS } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { registerWebhooks } from '@/lib/webhook-registration';
import { validateOAuthCallback, validateShopDomain } from '@/lib/oauth-validation';
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

    // Retrieve stored OAuth parameters from cookies
    const cookieStore = cookies();
    const storedState = cookieStore.get('shopify-oauth-state')?.value;
    const storedShop = cookieStore.get('shopify-oauth-shop')?.value;
    const storedPKCE = cookieStore.get('shopify-oauth-pkce')?.value;

    // CRITICAL: Validate the entire OAuth callback
    const validation = validateOAuthCallback(
      searchParams,
      process.env.SHOPIFY_API_SECRET!,
      storedState
    );

    if (!validation.valid) {
      console.error('[OAuth Callback] Validation failed:', validation.error);

      // Clear OAuth cookies on error
      cookieStore.delete('shopify-oauth-state');
      cookieStore.delete('shopify-oauth-shop');
      cookieStore.delete('shopify-oauth-pkce');

      return NextResponse.json({ error: validation.error }, { status: 403 });
    }

    // Additional validation: ensure shop matches stored shop
    if (shop !== storedShop) {
      console.error('[OAuth Callback] Shop mismatch:', { received: shop, expected: storedShop });
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

    // Validate scopes match what we requested
    const requestedScopes = (process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory').split(',');
    const grantedScopes = scope.split(',');
    const missingScopes = requestedScopes.filter(s => !grantedScopes.includes(s.trim()));

    if (missingScopes.length > 0) {
      console.error('[OAuth Callback] Missing required scopes:', missingScopes);
      return NextResponse.json({ error: 'Insufficient permissions granted' }, { status: 403 });
    }

    // Encrypt the access token before storing
    const encryptedToken = await encryptToken(accessToken);

    // Create session object with encrypted token
    const session = {
      shop,
      accessToken: encryptedToken,
      scope,
      tokenEncrypted: true, // Flag to indicate token is encrypted
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

    // Redirect to app - embedded apps will use App Bridge for session tokens
    const redirectUrl = new URL('/', process.env.NEXT_PUBLIC_HOST);
    redirectUrl.searchParams.set('shop', session.shop);
    redirectUrl.searchParams.set('host', req.nextUrl.searchParams.get('host') || '');
    redirectUrl.searchParams.set('authenticated', '1');

    return NextResponse.redirect(redirectUrl);
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