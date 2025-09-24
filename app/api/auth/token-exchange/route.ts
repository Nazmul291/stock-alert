import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';
import { supabaseAdmin } from '@/lib/supabase';
import { encryptToken } from '@/lib/token-encryption';

/**
 * Modern Token Exchange Endpoint
 * Exchanges session tokens for access tokens following Shopify best practices
 */
export async function POST(req: NextRequest) {
  try {
    // Require valid session token from App Bridge
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized',
        message: 'Valid session token required'
      }, { status: 401 });
    }

    const { shopDomain, sessionToken } = authResult;

    console.log('[Token Exchange] Starting token exchange for shop:', shopDomain);

    // Make token exchange request to Shopify
    const tokenExchangeUrl = `https://${shopDomain}/admin/oauth/access_token`;

    const tokenExchangeData = {
      client_id: process.env.SHOPIFY_API_KEY!,
      client_secret: process.env.SHOPIFY_API_SECRET!,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      // Request offline token for persistent access
      requested_token_type: 'urn:x-oath:params:oauth:token-type:offline-access'
    };

    console.log('[Token Exchange] Making request to Shopify...');

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
      console.error('[Token Exchange] Failed:', response.status, errorText);
      return NextResponse.json({
        error: 'Token exchange failed',
        status: response.status,
        details: errorText
      }, { status: response.status });
    }

    const tokenData = await response.json();
    console.log('[Token Exchange] Success! Received scopes:', tokenData.scope);

    // Parse granted scopes
    const grantedScopes = tokenData.scope.split(',').map((s: string) => s.trim());

    // Check if we got the essential scopes
    const hasReadProducts = grantedScopes.includes('read_products');
    const hasReadInventory = grantedScopes.includes('read_inventory');
    const canFunction = hasReadProducts && hasReadInventory;

    console.log('[Token Exchange] Scope analysis:', {
      granted: grantedScopes,
      hasReadProducts,
      hasReadInventory,
      canFunction
    });

    // Encrypt the access token before storing
    const encryptedToken = await encryptToken(tokenData.access_token);

    // Store or update in database
    const { data: existingStore } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('shop_domain', shopDomain)
      .single();

    const storeData = {
      shop_domain: shopDomain,
      access_token: encryptedToken,
      scope: tokenData.scope,
      scope_warning: canFunction ? null : 'Missing essential read scopes after token exchange',
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (existingStore) {
      await supabaseAdmin
        .from('stores')
        .update(storeData)
        .eq('id', existingStore.id);

      console.log('[Token Exchange] Updated existing store record');
    } else {
      await supabaseAdmin
        .from('stores')
        .insert({
          ...storeData,
          plan: 'free',
          created_at: new Date().toISOString()
        });

      console.log('[Token Exchange] Created new store record');
    }

    return NextResponse.json({
      success: true,
      shop: shopDomain,
      scopes: grantedScopes,
      canFunction,
      message: canFunction
        ? 'Access token obtained successfully'
        : 'Token obtained but missing essential scopes'
    });

  } catch (error: any) {
    console.error('[Token Exchange] Error:', error);
    return NextResponse.json({
      error: 'Token exchange failed',
      message: error.message
    }, { status: 500 });
  }
}