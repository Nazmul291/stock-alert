'use client';

import { useEffect, useState } from 'react';

interface ShopifyAppBridge {
  createApp: (config: { apiKey: string; host: string }) => any;
  idToken: () => Promise<string>;
}

declare global {
  interface Window {
    shopify?: ShopifyAppBridge;
  }
}

export function useAppBridge() {
  const [appBridge, setAppBridge] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Get host from URL params
    const params = new URLSearchParams(window.location.search);
    const host = params.get('host');
    const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;

    if (!host || !apiKey) {
      console.warn('Missing host or API key for App Bridge');
      return;
    }

    // Wait for Shopify App Bridge to load
    const initAppBridge = () => {
      if (window.shopify && window.shopify.createApp) {
        const app = window.shopify.createApp({
          apiKey,
          host,
          forceRedirect: false, // Don't force redirect for embedded apps
        });


        setAppBridge(app);
        setIsReady(true);
      } else {
        // Retry if App Bridge isn't loaded yet
        setTimeout(initAppBridge, 100);
      }
    };

    initAppBridge();
  }, []);

  return { appBridge, isReady };
}

// Get session token from URL if available
export function getSessionTokenFromURL(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const idToken = params.get('id_token');

  if (idToken) {
    return idToken;
  }

  return null;
}

export async function getSessionToken(appBridge: any): Promise<string | null> {
  // First, check if token is in URL (fastest, most reliable)
  const urlToken = getSessionTokenFromURL();
  if (urlToken) {
    return urlToken;
  }

  // If no URL token and no App Bridge, we can't get a token
  if (!appBridge) {
    console.warn('No session token in URL and App Bridge not initialized');
    return null;
  }

  // Try to get token from App Bridge (for dynamic refresh)
  try {
    // Use the utilities function to get session token
    if (window.shopify && window.shopify.idToken) {
      const sessionToken = await window.shopify.idToken();
      return sessionToken;
    } else if (appBridge.idToken) {
      const sessionToken = await appBridge.idToken();
      return sessionToken;
    } else if (appBridge.getSessionToken) {
      const sessionToken = await appBridge.getSessionToken();
      return sessionToken;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Failed to get session token from App Bridge:', error);
    return null;
  }
}

export function authenticatedFetch(appBridge: any) {
  return async (url: string, options: RequestInit = {}) => {
    const sessionToken = await getSessionToken(appBridge);

    if (!sessionToken) {
      throw new Error('No session token available');
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${sessionToken}`);
    headers.set('Content-Type', 'application/json');

    return fetch(url, {
      ...options,
      headers,
    });
  };
}