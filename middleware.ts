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

  // For API routes, be more permissive
  // Session token verification will be done in the API routes themselves
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Always allow billing routes with shop parameter
    if (request.nextUrl.pathname.startsWith('/api/billing')) {
      return NextResponse.next();
    }

    const authHeader = request.headers.get('authorization');

    // Allow requests with either auth header or shop parameter
    const shop = request.nextUrl.searchParams.get('shop');
    if (authHeader || shop) {
      return NextResponse.next();
    }

    // Only block if neither auth header nor shop parameter is present
    return NextResponse.json(
      { error: 'Unauthorized - Missing authentication' },
      { status: 401 }
    );
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