import { NextRequest, NextResponse } from 'next/server';

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

  // For API routes, pass the authorization header through
  // Session token verification will be done in the API routes themselves
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Allow requests with shop parameter for OAuth flow
      const shop = request.nextUrl.searchParams.get('shop');
      if (shop) {
        return NextResponse.next();
      }

      // For embedded app requests, require session token
      return NextResponse.json(
        { error: 'Unauthorized - Missing session token' },
        { status: 401 }
      );
    }

    // Pass through with auth header intact
    return NextResponse.next();
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