import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';

// Simple endpoint for Shopify to verify session token implementation
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: 'Unauthorized',
        message: 'Valid session token required',
        authenticated: false
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