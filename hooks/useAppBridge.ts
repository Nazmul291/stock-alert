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

        // Log for debugging
        console.log('App Bridge initialized with host:', host);

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

export async function getSessionToken(appBridge: any): Promise<string | null> {
  if (!appBridge) {
    console.error('App Bridge not initialized');
    return null;
  }

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
      console.error('No session token method available');
      return null;
    }
  } catch (error) {
    console.error('Failed to get session token:', error);
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