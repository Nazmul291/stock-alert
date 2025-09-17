'use client';

import { useCallback } from 'react';
import { useAppBridgeContext } from '@/components/app-bridge-provider';
import { getSessionToken } from './useAppBridge';

export function useAuthenticatedFetch() {
  const { appBridge, isReady } = useAppBridgeContext();

  const authenticatedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      if (!isReady || !appBridge) {
        throw new Error('App Bridge not initialized');
      }

      const sessionToken = await getSessionToken(appBridge);
      if (!sessionToken) {
        throw new Error('Failed to get session token');
      }

      const headers = new Headers(options.headers);
      headers.set('Authorization', `Bearer ${sessionToken}`);
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      return fetch(url, {
        ...options,
        headers,
      });
    },
    [appBridge, isReady]
  );

  return authenticatedFetch;
}