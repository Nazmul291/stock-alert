import { NextRequest, NextResponse } from 'next/server';
import { getSessionTokenFromRequest } from '@/lib/session-token';

export async function middleware(request: NextRequest) {
  // Skip authentication for public routes
  const publicPaths = [
    '/auth',
    '/api/auth',
    '/api/webhooks',
    '/privacy',
    '/terms',
    '/favicon.ico'
  ];

  const isPublicPath = publicPaths.some(path =>
    request.nextUrl.pathname.startsWith(path)
  );

  // Skip authentication for webhook routes (they use HMAC verification)
  if (isPublicPath) {
    return NextResponse.next();
  }

  // For API routes, verify session token
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const sessionToken = await getSessionTokenFromRequest(request);

    if (!sessionToken) {
      // Allow requests with shop parameter for OAuth flow
      const shop = request.nextUrl.searchParams.get('shop');
      if (shop) {
        return NextResponse.next();
      }

      return NextResponse.json(
        { error: 'Unauthorized - Invalid session token' },
        { status: 401 }
      );
    }

    // Add shop to headers for downstream use
    const requestHeaders = new Headers(request.headers);
    const destUrl = new URL(sessionToken.dest);
    requestHeaders.set('x-shopify-shop', destUrl.hostname);
    requestHeaders.set('x-shopify-user-id', sessionToken.sub);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // Pass through all other requests
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only match app routes, skip static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};