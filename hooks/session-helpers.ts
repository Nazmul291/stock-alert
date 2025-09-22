'use client';

// Get session token from URL if available
export function getSessionTokenFromURL(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  return params.get('id_token');
}

export async function getSessionToken(appBridge: any): Promise<string | null> {
  // First, check if token is in URL (fastest, most reliable)
  const urlToken = getSessionTokenFromURL();
  if (urlToken) {
    return urlToken;
  }

  // Try to get token from App Bridge (for dynamic refresh)
  try {
    // Modern API - window.shopify.idToken is the standard method
    if (window.shopify && typeof window.shopify.idToken === 'function') {
      const sessionToken = await window.shopify.idToken();
      if (sessionToken) {
        return sessionToken;
      }
    }

    // Fallback to appBridge object methods
    if (appBridge) {
      // Try idToken method on appBridge
      if (typeof appBridge.idToken === 'function') {
        const sessionToken = await appBridge.idToken();
        if (sessionToken) {
          return sessionToken;
        }
      }

      // Legacy getSessionToken method
      if (typeof appBridge.getSessionToken === 'function') {
        const sessionToken = await appBridge.getSessionToken();
        if (sessionToken) {
          return sessionToken;
        }
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
      [key: string]: any;
    };
  }
}