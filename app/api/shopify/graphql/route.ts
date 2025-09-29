import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';

/**
 * GraphQL endpoint for Shopify Admin API
 * This endpoint helps Shopify detect that we're using session tokens
 */
export async function POST(req: NextRequest) {
  try {
    // Validate session token
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: 'Unauthorized',
        message: 'Invalid or missing session token',
      }, { status: 401 });
    }

    const { query, variables } = await req.json();


    // Get the access token for this shop from database
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('access_token')
      .eq('shop_domain', authResult.shopDomain)
      .single();

    if (!store?.access_token) {
      console.error('[GraphQL] No access token found for shop:', authResult.shopDomain);
      return NextResponse.json({
        error: 'Shop not found',
        message: 'Please reinstall the app',
      }, { status: 404 });
    }

    // Make GraphQL request to Shopify Admin API
    const shopifyResponse = await fetch(
      `https://${authResult.shopDomain}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      }
    );

    const data = await shopifyResponse.json();

    // Log for Shopify detection

    return NextResponse.json(data, {
      status: shopifyResponse.status,
      headers: {
        'X-Shopify-Session-Token-Used': 'true',
        'X-GraphQL-Endpoint': 'active',
      }
    });

  } catch (error) {
    console.error('[GraphQL] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * GET endpoint to test if GraphQL is available
 */
export async function GET(req: NextRequest) {
  // Validate session token
  const authResult = await requireSessionToken(req);

  if (!authResult.isAuthenticated) {
    return NextResponse.json({
      available: false,
      error: 'Unauthorized',
    }, { status: 401 });
  }

  return NextResponse.json({
    available: true,
    authenticated: true,
    shop: authResult.shopDomain,
    endpoint: '/api/shopify/graphql',
    message: 'GraphQL endpoint ready for Shopify Admin API queries',
  });
}