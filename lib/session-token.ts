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
    console.error('SHOPIFY_API_SECRET not configured');
    return null;
  }

  try {
    const decoded = jwt.verify(token, apiSecret, {
      algorithms: ['HS256'],
      complete: false
    }) as SessionTokenPayload;

    // Extract shop domain from the dest field
    const destUrl = new URL(decoded.dest);
    const shop = destUrl.hostname;

    // Validate token fields
    if (!decoded.iss || !decoded.dest || !decoded.aud || !decoded.sub) {
      console.error('Invalid token payload structure');
      return null;
    }

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      console.error('Session token expired');
      return null;
    }

    return decoded;
  } catch (error) {
    console.error('Failed to verify session token:', error);
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