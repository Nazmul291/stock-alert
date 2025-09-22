import { jwtVerify } from 'jose';
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

/**
 * Edge Runtime compatible session token verification
 * Uses jose library instead of jsonwebtoken for Edge Runtime compatibility
 */
export async function verifySessionTokenEdge(token: string): Promise<SessionTokenPayload | null> {
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiSecret) {
    return null;
  }

  try {
    // Convert the secret to a Uint8Array for jose
    const secret = new TextEncoder().encode(apiSecret);

    // Verify the JWT
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      clockTolerance: 60 // Allow 60 seconds clock skew
    });

    const decoded = payload as unknown as SessionTokenPayload;

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
  } catch (error: any) {
    return null;
  }
}

export async function getSessionTokenFromRequestEdge(req: NextRequest): Promise<SessionTokenPayload | null> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifySessionTokenEdge(token);
}

export function getShopFromTokenEdge(tokenPayload: SessionTokenPayload): string {
  const destUrl = new URL(tokenPayload.dest);
  return destUrl.hostname;
}