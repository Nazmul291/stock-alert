import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';
import { supabaseAdmin } from '@/lib/supabase';
import { encryptToken, decryptToken } from '@/lib/token-encryption';
import { registerWebhooks } from '@/lib/webhook-registration';

/**
 * Session Token Authentication Endpoint
 * Modern Shopify authentication using session tokens instead of OAuth redirects
 */
export async function POST(req: NextRequest) {
  try {
    console.log('[Session Auth] Starting session token authentication...');

    // Require valid session token from App Bridge
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Session token authentication failed',
        needsAuth: true
      }, { status: 401 });
    }

    const { shopDomain, sessionToken, sessionTokenPayload } = authResult;

    console.log('[Session Auth] Valid session token received for:', shopDomain);

    // Log payload if available
    if (sessionTokenPayload) {
      console.log('[Session Auth] Session payload:', {
        iss: sessionTokenPayload.iss,
        dest: sessionTokenPayload.dest,
        aud: sessionTokenPayload.aud,
        sub: sessionTokenPayload.sub
      });
    } else {
      console.log('[Session Auth] Session token validated (no payload details available)');
    }

    // Exchange session token for access token using Shopify's token exchange endpoint
    const tokenExchangeUrl = `https://${shopDomain}/admin/oauth/access_token`;

    const tokenExchangeData = {
      client_id: process.env.SHOPIFY_API_KEY!,
      client_secret: process.env.SHOPIFY_API_SECRET!,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token'
    };

    console.log('[Session Auth] Requesting token exchange from Shopify...');

    const response = await fetch(tokenExchangeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams(tokenExchangeData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Session Auth] Token exchange failed:', response.status, errorText);

      return NextResponse.json({
        error: 'Token exchange failed',
        status: response.status,
        details: errorText,
        needsInstallation: response.status === 401 || response.status === 403
      }, { status: response.status });
    }

    const tokenData = await response.json();
    console.log('[Session Auth] Token exchange successful!');
    console.log('[Session Auth] Granted scopes:', tokenData.scope);

    // Parse granted scopes
    const grantedScopes = tokenData.scope.split(',').map((s: string) => s.trim());

    // Validate we got essential scopes (write scopes include read permissions)
    const hasReadProducts = grantedScopes.includes('read_products');
    const hasReadInventory = grantedScopes.includes('read_inventory');
    const hasWriteProducts = grantedScopes.includes('write_products');
    const hasWriteInventory = grantedScopes.includes('write_inventory');

    // Write scopes include read permissions in Shopify
    const canAccessProducts = hasReadProducts || hasWriteProducts;
    const canAccessInventory = hasReadInventory || hasWriteInventory;
    const canFunction = canAccessProducts && canAccessInventory;

    console.log('[Session Auth] Scope analysis:', {
      grantedScopes,
      hasReadProducts,
      hasReadInventory,
      hasWriteProducts,
      hasWriteInventory,
      canAccessProducts,
      canAccessInventory,
      canFunction
    });

    // Encrypt the access token
    const encryptedToken = await encryptToken(tokenData.access_token);

    // Use upsert approach to handle both insert and update
    console.log('[Session Auth] Using upsert to store/update shop data...');

    const { data: store, error: upsertError } = await supabaseAdmin
      .from('stores')
      .upsert(
        {
          shop_domain: shopDomain,
          access_token: encryptedToken,
          scope: tokenData.scope,
          scope_warning: null, // App is fully functional
          plan: 'free', // Default for new records
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString() // Will be ignored if record exists
        },
        {
          onConflict: 'shop_domain' // Update on conflict with shop_domain
        }
      )
      .select('*')
      .single();

    if (upsertError) {
      console.error('[Session Auth] Failed to upsert store:', upsertError);
      throw new Error(`Failed to store shop data: ${upsertError.message}`);
    }

    if (!store) {
      throw new Error('Upsert succeeded but no store data returned');
    }

    console.log('[Session Auth] Store upserted successfully:', store.id);

    // Create default store settings if they don't exist
    try {
      console.log('[Session Auth] Checking/creating default store settings...');

      const { data: existingSettings, error: settingsCheckError } = await supabaseAdmin
        .from('store_settings')
        .select('id')
        .eq('store_id', store.id)
        .single();

      if (!existingSettings) {
        // Create default settings
        const { data: newSettings, error: settingsError } = await supabaseAdmin
          .from('store_settings')
          .insert({
            store_id: store.id,
            low_stock_threshold: 5,
            auto_hide_enabled: false,
            email_notifications: true,
            slack_notifications: false,
            auto_republish_enabled: false,
            notification_email: store.email, // Use store email as default
            slack_webhook_url: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('*')
          .single();

        if (settingsError) {
          console.error('[Session Auth] Failed to create default settings:', settingsError);
          // Don't fail the whole flow for settings creation
        } else {
          console.log('[Session Auth] ✅ Default settings created:', newSettings.id);
        }
      } else {
        console.log('[Session Auth] Settings already exist, skipping creation');
      }
    } catch (error) {
      console.error('[Session Auth] Error handling settings:', error);
      // Don't fail the whole flow for settings issues
    }

    // Create setup progress record if it doesn't exist
    try {
      console.log('[Session Auth] Checking/creating setup progress...');

      const { data: existingProgress, error: progressCheckError } = await supabaseAdmin
        .from('setup_progress')
        .select('id')
        .eq('store_id', store.id)
        .single();

      if (!existingProgress) {
        // Create initial setup progress
        const { data: newProgress, error: progressError } = await supabaseAdmin
          .from('setup_progress')
          .insert({
            store_id: store.id,
            app_installed: true, // Just completed installation
            global_settings_configured: false, // User needs to configure
            notifications_configured: false, // User needs to set up notifications
            product_thresholds_configured: false, // User needs to set per-product thresholds
            first_product_tracked: false, // Will be set when first product is tracked
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('*')
          .single();

        if (progressError) {
          console.error('[Session Auth] Failed to create setup progress:', progressError);
        } else {
          console.log('[Session Auth] ✅ Setup progress created:', newProgress.id);
        }
      } else {
        console.log('[Session Auth] Setup progress already exists, skipping creation');
      }
    } catch (error) {
      console.error('[Session Auth] Error handling setup progress:', error);
    }

    // Register webhooks after successful authentication
    if (canFunction) {
      try {
        console.log('[Session Auth] Registering webhooks...');

        // Decrypt token for webhook registration (registerWebhooks expects plain token)
        const plainToken = await decryptToken(encryptedToken);
        await registerWebhooks(shopDomain, plainToken);

        console.log('[Session Auth] ✅ Webhooks registered successfully');
      } catch (error: any) {
        console.error('[Session Auth] Failed to register webhooks:', error);
        // Don't fail the entire auth flow for webhook registration errors
        // Log warning but continue
        console.warn('[Session Auth] ⚠️ Authentication succeeded but webhook registration failed');
      }
    } else {
      console.log('[Session Auth] ⚠️ Skipping webhook registration - insufficient scopes');
    }

    // Fetch shop information if we don't have email
    if (store && !store.email && canFunction) {
      try {
        const { getShopifyClient } = await import('@/lib/shopify');
        const client = await getShopifyClient(shopDomain, encryptedToken);
        const shopResponse = await client.get({ path: 'shop.json' });

        if (shopResponse.body.shop?.email) {
          await supabaseAdmin
            .from('stores')
            .update({ email: shopResponse.body.shop.email })
            .eq('id', store.id);

          console.log('[Session Auth] Updated store email from shop info');
        }
      } catch (error) {
        console.warn('[Session Auth] Failed to fetch shop info:', error);
      }
    }

    // Ensure we have a valid store object
    if (!store || !store.id) {
      throw new Error('Store creation/update failed - no store object returned');
    }

    // Return confident success response
    return NextResponse.json({
      success: true,
      authenticated: true,
      shop: shopDomain,
      message: 'Stock Alert is ready to use'
    });

  } catch (error: any) {
    console.error('[Session Auth] Authentication failed:', error);
    return NextResponse.json({
      error: 'Session authentication failed',
      message: error.message,
      needsAuth: true
    }, { status: 500 });
  }
}