import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';

export async function POST(req: NextRequest) {
  try {
    // Validate session token
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: 'Unauthorized',
        authenticated: false,
      }, { status: 401 });
    }

    // Log the authentication test results
    const body = await req.json();
    console.log('[AUTH LOG] Shop:', authResult.shopDomain);
    console.log('[AUTH LOG] Test results:', JSON.stringify(body.tests, null, 2));
    console.log('[AUTH LOG] Timestamp:', body.timestamp);

    return NextResponse.json({
      success: true,
      logged: true,
      shop: authResult.shopDomain,
    });

  } catch (error) {
    console.error('[AUTH LOG] Error:', error);
    return NextResponse.json({
      error: 'Failed to log',
      success: false,
    }, { status: 500 });
  }
}