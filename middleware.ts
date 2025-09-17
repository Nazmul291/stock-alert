import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // Log billing API requests for debugging
  if (request.nextUrl.pathname === '/api/billing' && request.method === 'POST') {
    console.log('[MIDDLEWARE] Billing POST request received');
    console.log('[MIDDLEWARE] Content-Type:', request.headers.get('content-type'));
    console.log('[MIDDLEWARE] Content-Length:', request.headers.get('content-length'));

    // Ensure the request has proper headers
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('[MIDDLEWARE] WARNING: Invalid or missing Content-Type header');
    }
  }

  // Pass through all requests
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only match app routes, skip static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};