import { NextRequest, NextResponse } from 'next/server';

export async function middleware(request: NextRequest) {
  // Minimal middleware - just pass through everything
  // Authentication will be handled in the pages themselves
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Only match app routes, skip static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};