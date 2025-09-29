import { NextRequest, NextResponse } from 'next/server';
import { requireSessionToken } from '@/lib/session-token';

/**
 * Test endpoint to verify session token authentication is working
 * This helps Shopify's automated checks detect that we're using session tokens
 */
export async function GET(req: NextRequest) {
  const authResult = await requireSessionToken(req);

  if (!authResult.isAuthenticated) {
    return NextResponse.json({
      error: authResult.error,
      code: authResult.errorCode,
      authenticated: false,
    }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    shop: authResult.shopDomain,
    message: 'Session token authentication successful',
    timestamp: new Date().toISOString(),
    sessionTokenPayload: {
      iss: authResult.sessionTokenPayload?.iss,
      dest: authResult.sessionTokenPayload?.dest,
      aud: authResult.sessionTokenPayload?.aud,
    }
  });
}

export async function POST(req: NextRequest) {
  return GET(req); // Same logic for POST
}