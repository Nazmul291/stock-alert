import { NextRequest, NextResponse } from 'next/server';
import { verifySessionTokenEdge } from '@/lib/session-token-edge';

export async function middleware(request: NextRequest) {
  // Skip authentication for public routes
  const publicPaths = [
    '/auth',
    '/auth-bounce',
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

  // For API routes, validate session tokens where required
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Always allow billing callback (OAuth flow)
    if (request.nextUrl.pathname.startsWith('/api/billing/callback')) {
      return NextResponse.next();
    }

    // Allow billing routes with valid session token only
    if (request.nextUrl.pathname.startsWith('/api/billing')) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized - Missing session token' },
          { status: 401 }
        );
      }

      const sessionToken = authHeader.substring(7);
      const tokenPayload = await verifySessionTokenEdge(sessionToken);

      if (!tokenPayload) {
        return NextResponse.json(
          { error: 'Unauthorized - Invalid session token' },
          { status: 401 }
        );
      }

      return NextResponse.next();
    }

    // Protected API routes that require session tokens
    const protectedApiRoutes = [
      '/api/products/list',
      '/api/products/stats',
      '/api/products/sync',
      '/api/products/reset',
      '/api/products/validate',
      '/api/setup-progress',
      '/api/webhooks/register',
      '/api/webhooks/list',
      '/api/session-check'
    ];

    const isProtectedRoute = protectedApiRoutes.some(route =>
      request.nextUrl.pathname.startsWith(route)
    );

    if (isProtectedRoute) {
      const authHeader = request.headers.get('authorization');

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Unauthorized - Missing session token' },
          { status: 401 }
        );
      }

      const sessionToken = authHeader.substring(7);
      const tokenPayload = await verifySessionTokenEdge(sessionToken);

      if (!tokenPayload) {
        return NextResponse.json(
          { error: 'Unauthorized - Invalid session token' },
          { status: 401 }
        );
      }
    }

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