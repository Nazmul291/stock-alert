'use client';

import { useCallback } from 'react';
import { useAppBridgeContext } from '@/components/app-bridge-provider';
import { getSessionToken } from './useAppBridge';

export function useAuthenticatedFetch() {
  const { appBridge, isReady } = useAppBridgeContext();

  const authenticatedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);

      // Try to get session token if App Bridge is available
      if (isReady && appBridge) {
        try {
          const sessionToken = await getSessionToken(appBridge);
          if (sessionToken) {
            headers.set('Authorization', `Bearer ${sessionToken}`);
          }
        } catch (error) {
          console.warn('Failed to get session token:', error);
          // Continue without session token
        }
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