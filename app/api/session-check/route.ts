import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';

// Simple endpoint for Shopify to verify session token implementation
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const hasApiSecret = !!process.env.SHOPIFY_API_SECRET;

    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized',
        errorCode: authResult.errorCode,
        message: 'Valid session token required',
        authenticated: false,
        debug: {
          hasAuthHeader: !!authHeader,
          hasApiSecret,
          tokenLength: authHeader ? authHeader.length : 0
        }
      }, { status: 401 });
    }

    return NextResponse.json({
      authenticated: true,
      shopDomain: authResult.shopDomain,
      message: 'Session token verified successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Internal server error',
      authenticated: false,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}