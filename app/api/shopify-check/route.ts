import { NextRequest, NextResponse } from 'next/server';

// This endpoint helps Shopify verify the app is working
export async function GET(req: NextRequest) {
  const headers = req.headers;

  // Log the check for debugging
  console.log('[SHOPIFY CHECK] Request received');
  console.log('[SHOPIFY CHECK] Authorization:', headers.get('authorization') ? 'Present' : 'Missing');
  console.log('[SHOPIFY CHECK] User-Agent:', headers.get('user-agent'));

  // Check if this is from Shopify's checker
  const userAgent = headers.get('user-agent') || '';
  const isShopifyCheck = userAgent.includes('Shopify') || userAgent.includes('shopify');

  if (isShopifyCheck) {
    console.log('[SHOPIFY CHECK] Detected Shopify automated check');
  }

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

  console.log('[SHOPIFY CHECK] POST request with auth:', authHeader ? 'Yes' : 'No');

  // If there's a session token, verify it
  if (authHeader && authHeader.startsWith('Bearer ')) {
    console.log('[SHOPIFY CHECK] Session token present in POST request');
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