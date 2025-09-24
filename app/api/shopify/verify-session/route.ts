import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';

/**
 * Endpoint to verify session token and make Shopify API call
 * This helps Shopify's detection system recognize our session token usage
 */
export async function GET(req: NextRequest) {
  try {
    // Validate session token - this is what Shopify needs to detect
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      console.log('[VerifySession] No valid session token');
      return NextResponse.json({
        authenticated: false,
        error: 'Invalid or missing session token',
      }, { status: 401 });
    }

    console.log('[VerifySession] Valid session token for shop:', authResult.shopDomain);

    // Get the access token for this shop
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('access_token')
      .eq('shop_domain', authResult.shopDomain)
      .single();

    if (!store?.access_token) {
      return NextResponse.json({
        authenticated: true,
        error: 'Shop not found in database',
      }, { status: 404 });
    }

    // Make a simple call to Shopify Admin API to verify everything works
    const shopifyResponse = await fetch(
      `https://${authResult.shopDomain}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (shopifyResponse.ok) {
      const shopData = await shopifyResponse.json();
      console.log('[VerifySession] Successfully verified with Shopify API for:', shopData.shop?.name);

      return NextResponse.json({
        authenticated: true,
        sessionTokenValid: true,
        shop: authResult.shopDomain,
        shopName: shopData.shop?.name,
        message: 'Session token validated and Shopify API accessible',
      }, {
        headers: {
          'X-Session-Token-Verified': 'true',
          'X-Shopify-Shop-Domain': authResult.shopDomain,
        }
      });
    }

    return NextResponse.json({
      authenticated: true,
      sessionTokenValid: true,
      shop: authResult.shopDomain,
      shopifyApiError: true,
      status: shopifyResponse.status,
    });

  } catch (error) {
    console.error('[VerifySession] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}

/**
 * POST endpoint for testing session tokens with GraphQL
 */
export async function POST(req: NextRequest) {
  try {
    // Validate session token
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        authenticated: false,
        error: 'Invalid or missing session token',
      }, { status: 401 });
    }

    // Get the access token
    const { supabaseAdmin } = await import('@/lib/supabase');
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('access_token')
      .eq('shop_domain', authResult.shopDomain)
      .single();

    if (!store?.access_token) {
      return NextResponse.json({
        authenticated: true,
        error: 'Shop not found',
      }, { status: 404 });
    }

    // Make a GraphQL query to get shop info
    const graphqlQuery = {
      query: `
        query getShop {
          shop {
            id
            name
            email
            currencyCode
            primaryDomain {
              url
            }
          }
        }
      `
    };

    const shopifyResponse = await fetch(
      `https://${authResult.shopDomain}/admin/api/2024-01/graphql.json`,
      {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(graphqlQuery),
      }
    );

    const data = await shopifyResponse.json();

    console.log('[VerifySession] GraphQL query successful for:', authResult.shopDomain);

    return NextResponse.json({
      authenticated: true,
      sessionTokenValid: true,
      shop: authResult.shopDomain,
      graphqlResponse: data,
      message: 'Session token validated with GraphQL query',
    }, {
      headers: {
        'X-Session-Token-Verified': 'true',
        'X-GraphQL-Used': 'true',
      }
    });

  } catch (error) {
    console.error('[VerifySession] POST Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}