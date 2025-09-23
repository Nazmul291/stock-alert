'use client';

// Get session token from URL if available
export function getSessionTokenFromURL(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  return params.get('id_token');
}

export async function getSessionToken(appBridge: any, forceRefresh: boolean = false): Promise<string | null> {
  // If not forcing refresh, check URL token first
  if (!forceRefresh) {
    const urlToken = getSessionTokenFromURL();
    if (urlToken) {
      return urlToken;
    }
  }

  // Try to get fresh token from App Bridge (multiple attempts for reliability)
  try {
    let sessionToken: string | null = null;

    // Method 1: Modern App Bridge v4+ API - ShopifyBridge.getSessionToken
    if (window.ShopifyBridge && typeof window.ShopifyBridge.getSessionToken === 'function') {
      try {
        sessionToken = await window.ShopifyBridge.getSessionToken();
        if (sessionToken) {
          return sessionToken;
        }
      } catch (error) {
        // Continue to next method
      }
    }

    // Method 2: Legacy API - window.shopify.idToken
    if (window.shopify && typeof window.shopify.idToken === 'function') {
      try {
        sessionToken = await window.shopify.idToken();
        if (sessionToken) {
          return sessionToken;
        }
      } catch (error) {
        // Continue to next method
      }
    }

    // Method 3: AppBridge object methods
    if (appBridge) {
      // Try idToken method on appBridge
      if (typeof appBridge.idToken === 'function') {
        try {
          sessionToken = await appBridge.idToken();
          if (sessionToken) {
            return sessionToken;
          }
        } catch (error) {
          // Continue to next method
        }
      }

      // Legacy getSessionToken method
      if (typeof appBridge.getSessionToken === 'function') {
        try {
          sessionToken = await appBridge.getSessionToken();
          if (sessionToken) {
            return sessionToken;
          }
        } catch (error) {
          // Continue to next method
        }
      }
    }

    // Method 4: Try to recreate App Bridge instance and get fresh token
    if (window.shopify && typeof window.shopify.createApp === 'function') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const host = urlParams.get('host');
        const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

        if (host && apiKey) {
          const freshApp = window.shopify.createApp({
            apiKey: apiKey,
            host: host,
            forceRedirect: false,
          });

          if (freshApp && typeof freshApp.idToken === 'function') {
            sessionToken = await freshApp.idToken();
            if (sessionToken) {
              return sessionToken;
            }
          }
        }
      } catch (error) {
        // Final fallback failed
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
      createApp?: (config: any) => any;
      [key: string]: any;
    };
    ShopifyBridge?: {
      getSessionToken?: () => Promise<string>;
      createApp?: (config: any) => any;
      [key: string]: any;
    };
  }
}