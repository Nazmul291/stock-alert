'use client';

import { useCallback } from 'react';
import { useAppBridge } from '@/components/app-bridge-provider';
import { getSessionToken, getSessionTokenFromURL } from './session-helpers';

export function useAuthenticatedFetch() {
  const { appBridge, isReady } = useAppBridge();

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

      // Try to get session token (prefer fresh tokens from App Bridge)
      try {
        // Try App Bridge first for fresh tokens if available
        if (isReady && appBridge) {
          try {
            sessionToken = await getSessionToken(appBridge);
          } catch (error) {
            // App Bridge failed, fall back to URL token
          }
        }

        // Fall back to URL token if App Bridge failed or not ready
        if (!sessionToken) {
          sessionToken = getSessionTokenFromURL();
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
        // Try to get a fresh token from App Bridge and retry once
        if (isReady && appBridge && !(options.headers as any)?.['X-Retry-Attempted']) {
          try {
            const freshToken = await getSessionToken(appBridge, true); // Force refresh on 401
            if (freshToken && freshToken !== sessionToken) {
              // We got a fresh token, retry the request
              const retryHeaders = new Headers(options.headers);
              retryHeaders.set('Authorization', `Bearer ${freshToken}`);
              retryHeaders.set('X-Retry-Attempted', 'true'); // Prevent infinite retry

              return fetch(url, {
                ...options,
                headers: retryHeaders,
                credentials: 'include',
              });
            }
          } catch (error) {
            // Fresh token fetch failed, continue with redirect
          }
        }

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