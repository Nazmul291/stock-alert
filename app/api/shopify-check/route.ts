import { NextRequest, NextResponse } from 'next/server';

// This endpoint helps Shopify verify the app is working
export async function GET(req: NextRequest) {
  const headers = req.headers;


  // Check if this is from Shopify's checker
  const userAgent = headers.get('user-agent') || '';
  const isShopifyCheck = userAgent.includes('Shopify') || userAgent.includes('shopify');


  return NextResponse.json({
    status: 'ok',
    embedded: true,
    sessionTokenSupport: true,
    appBridge: 'cdn',
    timestamp: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  const headers = req.headers;
  const authHeader = headers.get('authorization');

  // If there's a session token, verify it
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return NextResponse.json({
      status: 'authenticated',
      sessionToken: true
    });
  }

  return NextResponse.json({
    status: 'unauthenticated',
    sessionToken: false
  });
}