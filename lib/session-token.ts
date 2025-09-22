import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

export interface SessionTokenPayload {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  sid: string;
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiSecret) {
    console.error('[SESSION_TOKEN] SHOPIFY_API_SECRET environment variable is not set');
    return null;
  }

  try {
    // First decode without verification to see the payload
    const decodedHeader = jwt.decode(token, { complete: true });

    const decoded = jwt.verify(token, apiSecret, {
      algorithms: ['HS256'],
      complete: false,
      clockTolerance: 60 // Allow 60 seconds clock skew
    }) as SessionTokenPayload;

    // Extract shop domain from the dest field
    const destUrl = new URL(decoded.dest);
    const shop = destUrl.hostname;

    // Validate token fields
    if (!decoded.iss || !decoded.dest || !decoded.aud || !decoded.sub) {
      return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      return null;
    }

    return decoded;
  } catch (error) {
    return null;
  }
}

export async function getSessionTokenFromRequest(req: NextRequest): Promise<SessionTokenPayload | null> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifySessionToken(token);
}

export function getShopFromToken(tokenPayload: SessionTokenPayload): string {
  const destUrl = new URL(tokenPayload.dest);
  return destUrl.hostname;
}

/**
 * Centralized authentication middleware for API routes
 * Validates session token and returns shop domain and authentication status
 */
export async function requireSessionToken(req: NextRequest): Promise<{
  isAuthenticated: boolean;
  shopDomain: string | null;
  sessionTokenPayload: SessionTokenPayload | null;
  error?: string;
  errorCode?: string;
}> {
  const authHeader = req.headers.get('authorization');

  // Check if authorization header exists
  if (!authHeader) {
    return {
      isAuthenticated: false,
      shopDomain: null,
      sessionTokenPayload: null,
      error: 'Missing Authorization header',
      errorCode: 'MISSING_AUTH_HEADER'
    };
  }

  // Check if authorization header format is correct
  if (!authHeader.startsWith('Bearer ')) {
    return {
      isAuthenticated: false,
      shopDomain: null,
      sessionTokenPayload: null,
      error: 'Invalid Authorization header format. Expected: Bearer <token>',
      errorCode: 'INVALID_AUTH_FORMAT'
    };
  }

  const sessionTokenPayload = await getSessionTokenFromRequest(req);

  if (!sessionTokenPayload) {
    return {
      isAuthenticated: false,
      shopDomain: null,
      sessionTokenPayload: null,
      error: 'Invalid or expired session token',
      errorCode: 'INVALID_SESSION_TOKEN'
    };
  }

  const shopDomain = getShopFromToken(sessionTokenPayload);

  return {
    isAuthenticated: true,
    shopDomain,
    sessionTokenPayload,
  };
}