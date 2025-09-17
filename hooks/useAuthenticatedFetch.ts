'use client';

import { useCallback } from 'react';
import { useAppBridgeContext } from '@/components/app-bridge-provider';
import { getSessionToken, getSessionTokenFromURL } from './useAppBridge';

export function useAuthenticatedFetch() {
  const { appBridge, isReady } = useAppBridgeContext();

  const authenticatedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);

      // Try to get session token (checks URL first, then App Bridge)
      try {
        // First check URL for id_token
        const urlToken = getSessionTokenFromURL();
        if (urlToken) {
          headers.set('Authorization', `Bearer ${urlToken}`);
        } else if (isReady && appBridge) {
          // Fall back to App Bridge if no URL token
          const sessionToken = await getSessionToken(appBridge);
          if (sessionToken) {
            headers.set('Authorization', `Bearer ${sessionToken}`);
          }
        }
      } catch (error) {
        // Continue without session token
      }

      // Always set Content-Type if not provided
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      // Add shop parameter to URL if available and not already present
      const urlObj = new URL(url, window.location.origin);
      const params = new URLSearchParams(window.location.search);
      const shop = params.get('shop');
      if (shop && !urlObj.searchParams.has('shop')) {
        urlObj.searchParams.set('shop', shop);
      }

      return fetch(urlObj.toString(), {
        ...options,
        headers,
        credentials: 'include', // Include cookies for session management
      });
    },
    [appBridge, isReady]
  );

  return authenticatedFetch;
}