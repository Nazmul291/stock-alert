'use client';

import { useCallback } from 'react';
import { useAppBridgeContext } from '@/components/app-bridge-provider';
import { getSessionToken, getSessionTokenFromURL } from './session-helpers';

export function useAuthenticatedFetch() {
  const { appBridge, isReady } = useAppBridgeContext();

  const redirectToBounce = useCallback((targetUrl: string) => {
    const urlParams = new URLSearchParams(window.location.search);
    const bounceUrl = new URL('/auth-bounce', window.location.origin);

    // Preserve important parameters
    bounceUrl.searchParams.set('redirectTo', targetUrl);
    if (urlParams.get('shop')) bounceUrl.searchParams.set('shop', urlParams.get('shop')!);
    if (urlParams.get('host')) bounceUrl.searchParams.set('host', urlParams.get('host')!);

    window.location.href = bounceUrl.toString();
  }, []);

  const authenticatedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const headers = new Headers(options.headers);
      let sessionToken: string | null = null;

      // Try to get session token (checks URL first, then App Bridge)
      try {
        // First check URL for id_token
        const urlToken = getSessionTokenFromURL();
        if (urlToken) {
          sessionToken = urlToken;
        } else if (isReady && appBridge) {
          // Fall back to App Bridge if no URL token
          sessionToken = await getSessionToken(appBridge);
        }

        if (sessionToken) {
          headers.set('Authorization', `Bearer ${sessionToken}`);
        }
      } catch (error) {
        // Silent fail, continue without token
      }

      // Always set Content-Type if not provided
      if (!headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      // Make the request
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      // If we get 401 and it's not an auth-related endpoint, try to refresh session
      if (response.status === 401 && !url.includes('/api/auth') && !url.includes('/auth-bounce')) {
        const responseBody = await response.text();

        if (responseBody.includes('session token') || responseBody.includes('Unauthorized')) {
          // Redirect to bounce page to get fresh session token
          const currentPath = window.location.pathname;
          redirectToBounce(currentPath + window.location.search);

          // Return a promise that never resolves since we're redirecting
          return new Promise(() => {});
        }
      }

      return response;
    },
    [appBridge, isReady, redirectToBounce]
  );

  return authenticatedFetch;
}