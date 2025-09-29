import { NextRequest, NextResponse } from 'next/server';

// Simple health check endpoint that Shopify might use
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    embedded: true,
    appBridge: 'cdn',
    sessionTokenSupport: true,
    hasAuthHeader: !!authHeader,
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return NextResponse.json({
      authenticated: true,
      sessionToken: true,
    });
  }

  return NextResponse.json({
    authenticated: false,
    sessionToken: false,
  }, { status: 401 });
}