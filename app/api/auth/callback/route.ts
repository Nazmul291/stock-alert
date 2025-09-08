import { NextRequest, NextResponse } from 'next/server';
import { shopify, generateSessionToken, WEBHOOK_TOPICS } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const code = searchParams.get('code');
    const shop = searchParams.get('shop');
    const state = searchParams.get('state');
    const hmac = searchParams.get('hmac');
    
    console.log('OAuth Callback received:', { shop, hasCode: !!code, state, hmac });
    
    if (!code || !shop) {
      console.error('Missing code or shop in callback');
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
      console.error('Failed to get access token:', accessTokenResponse.status);
      return NextResponse.json({ error: 'Failed to get access token' }, { status: 500 });
    }
    
    const tokenData = await accessTokenResponse.json();
    const accessToken = tokenData.access_token;
    const scope = tokenData.scope;
    
    console.log('Access token obtained successfully');
    
    // Create session object compatible with rest of the code
    const session = {
      shop,
      accessToken,
      scope,
    };

    console.log('OAuth Callback - Session received:', {
      shop: session.shop,
      scope: session.scope,
      hasAccessToken: !!session.accessToken
    });

    // Store shop data in Supabase
    const { data: existingStore, error: fetchError } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('shop_domain', session.shop)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching store:', fetchError);
      throw fetchError;
    }

    let storeId: string;

    if (existingStore) {
      console.log('Updating existing store:', existingStore.id);
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
        console.error('Error updating store:', updateError);
        throw updateError;
      }
      
      storeId = updatedStore!.id;
      console.log('Store updated successfully:', storeId);
    } else {
      console.log('Creating new store for:', session.shop);
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
        console.error('Error creating store:', insertError);
        throw insertError;
      }
      
      storeId = newStore!.id;
      console.log('Store created successfully:', storeId);

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
        console.error('Error creating store settings:', settingsError);
        // Don't throw here, settings can be created later
      } else {
        console.log('Store settings created successfully');
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
        console.error('Error creating setup progress:', progressError);
        // Don't throw here, can be created later
      } else {
        console.log('Setup progress created successfully');
      }
    }

    // Skip webhook registration for now - can be done later
    console.log('Skipping webhook registration for now');

    // Generate session token
    const token = generateSessionToken(session.shop, session.accessToken);

    // Redirect to app with token
    const redirectUrl = new URL('/', process.env.NEXT_PUBLIC_HOST);
    redirectUrl.searchParams.set('shop', session.shop);
    redirectUrl.searchParams.set('host', req.nextUrl.searchParams.get('host') || '');
    redirectUrl.searchParams.set('authenticated', '1');
    
    const response = NextResponse.redirect(redirectUrl);
    response.cookies.set('shopify-session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('OAuth callback error:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
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