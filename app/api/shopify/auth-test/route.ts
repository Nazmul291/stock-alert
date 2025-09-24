import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';

/**
 * Endpoint specifically for Shopify to test session token authentication
 * This endpoint follows Shopify's exact requirements for session token validation
 */
export async function GET(req: NextRequest) {
  try {
    // Log for debugging
    console.log('[SHOPIFY AUTH TEST] Request received');
    console.log('[SHOPIFY AUTH TEST] Headers:', Object.fromEntries(req.headers.entries()));

    // Check for Authorization header
    const authHeader = req.headers.get('authorization');

    if (!authHeader) {
      console.log('[SHOPIFY AUTH TEST] No authorization header');
      return NextResponse.json({
        error: 'Missing authorization header',
        authenticated: false,
      }, { status: 401 });
    }

    if (!authHeader.startsWith('Bearer ')) {
      console.log('[SHOPIFY AUTH TEST] Invalid authorization format');
      return NextResponse.json({
        error: 'Invalid authorization header format',
        authenticated: false,
      }, { status: 401 });
    }

    // Validate session token
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      console.log('[SHOPIFY AUTH TEST] Session token validation failed:', authResult.error);
      return NextResponse.json({
        error: authResult.error || 'Invalid session token',
        errorCode: authResult.errorCode,
        authenticated: false,
      }, { status: 401 });
    }

    console.log('[SHOPIFY AUTH TEST] Successfully authenticated for shop:', authResult.shopDomain);

    // Success response - exactly what Shopify expects
    return NextResponse.json({
      authenticated: true,
      shop: authResult.shopDomain,
      message: 'Session token successfully validated',
      timestamp: new Date().toISOString(),
    }, {
      status: 200,
      headers: {
        'X-Shopify-Authenticated': 'true',
        'X-Shop-Domain': authResult.shopDomain || '',
      }
    });

  } catch (error) {
    console.error('[SHOPIFY AUTH TEST] Error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      authenticated: false,
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}

export async function OPTIONS(req: NextRequest) {
  // Handle preflight requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': 'https://admin.shopify.com',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  });
}