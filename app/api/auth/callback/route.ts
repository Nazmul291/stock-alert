import { NextRequest, NextResponse } from 'next/server';
import { shopify, WEBHOOK_TOPICS } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { registerWebhooks } from '@/lib/webhook-registration';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const shop = searchParams.get('shop');
    const state = searchParams.get('state');
    const hmac = searchParams.get('hmac');
    
    if (!code || !shop) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    
    // Exchange code for access token
    const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });
    
    if (!accessTokenResponse.ok) {
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 });
    }
    
    const tokenData = await accessTokenResponse.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;
    
    // Create session object compatible with rest of the code
    const session = {
      shop,
      accessToken,
      scope,
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

    // Register webhooks for inventory tracking
    try {
      await registerWebhooks(session.shop, session.accessToken);
    } catch (webhookError) {
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