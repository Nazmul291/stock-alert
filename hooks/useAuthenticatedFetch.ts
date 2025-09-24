'use client';

import { useCallback } from 'react';
// Using session-helpers instead of separate hook for session token access
import TokenManager from '@/lib/token-manager';
import FormPreservation from '@/lib/form-preservation';
import RequestQueue from '@/lib/request-queue';
import { triggerAuthNotification } from '@/components/auth-notification';

export function useAuthenticatedFetch() {
  // Using existing token manager system instead of separate hook

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
      const tokenManager = TokenManager.getInstance();
      const formPreservation = FormPreservation.getInstance();
      const requestQueue = RequestQueue.getInstance();

      // Try to get session token using existing token manager
      try {
        const appBridge = (window as any).__SHOPIFY_APP__;
        if (appBridge) {
          sessionToken = await tokenManager.getToken(appBridge);
        }

        if (sessionToken) {
          headers.set('Authorization', `Bearer ${sessionToken}`);
        } else {
          // Don't show error immediately - App Bridge might still be loading
          console.warn('[AuthenticatedFetch] No session token available');

          // Only show notification if App Bridge should be ready but token still failed
          if (appBridge) {
            // Wait a bit before showing error - token might be loading
            setTimeout(async () => {
              const token = await tokenManager.getToken(appBridge);
              if (!token) {
                triggerAuthNotification('Session expired. Refreshing authentication...', 'warning');
              }
            }, 2000);
          }
          // Continue request without token - will trigger 401 handling if needed
        }
      } catch (error) {
        console.error('[AuthenticatedFetch] Failed to get token:', error);
        // Continue without token
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

      // Handle 401 Unauthorized
      if (response.status === 401 && !url.includes('/api/auth') && !url.includes('/auth-bounce')) {
        console.warn('[AuthenticatedFetch] Received 401, attempting token refresh...');

        // Try to get a fresh token and retry once
        const appBridge = (window as any).__SHOPIFY_APP__;
        if (appBridge && !(options.headers as any)?.['X-Retry-Attempted']) {
          try {
            // Get fresh token using token manager
            const freshToken = await tokenManager.getToken(appBridge, true);

            if (freshToken && freshToken !== sessionToken) {
              console.log('[AuthenticatedFetch] Got fresh token, retrying request...');

              // Use request queue for retry with automatic backoff
              const retryHeaders = new Headers(options.headers);
              retryHeaders.set('Authorization', `Bearer ${freshToken}`);
              retryHeaders.set('X-Retry-Attempted', 'true');

              const retryResponse = await requestQueue.enqueuePriority(url, {
                ...options,
                headers: retryHeaders,
                credentials: 'include',
              });

              if (retryResponse.ok) {
                console.log('[AuthenticatedFetch] Retry successful with fresh token');
              } else {
                console.warn('[AuthenticatedFetch] Retry failed, status:', retryResponse.status);
              }

              return retryResponse;
            }
          } catch (error) {
            console.error('[AuthenticatedFetch] Fresh token fetch failed:', error);
          }
        }

        // If we're still here, all retries failed
        const responseBody = await response.text();
        if (responseBody.includes('session token') || responseBody.includes('Unauthorized')) {
          // Save pending request for retry after redirect
          if (options.body) {
            formPreservation.savePendingRequest(
              url,
              options.method || 'GET',
              typeof options.body === 'string' ? JSON.parse(options.body) : options.body
            );
          }

          // Notify user
          triggerAuthNotification('Session expired. Refreshing authentication...', 'warning');

          // Clear token cache
          tokenManager.clearCache();

          console.log('[AuthenticatedFetch] Redirecting to auth-bounce for fresh session...');
          const currentPath = window.location.pathname;
          redirectToBounce(currentPath + window.location.search);

          // Return a promise that never resolves since we're redirecting
          return new Promise(() => {});
        }
      }

      // Handle 429 Too Many Requests - use request queue for automatic retry
      if (response.status === 429) {
        console.warn('[AuthenticatedFetch] Rate limited, queueing for retry...');
        triggerAuthNotification('Too many requests. Retrying automatically...', 'warning');

        return requestQueue.enqueue(url, {
          ...options,
          headers,
          credentials: 'include',
        });
      }

      return response;
    },
    [redirectToBounce]
  );

  return authenticatedFetch;
}