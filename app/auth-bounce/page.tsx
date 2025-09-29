'use client';

import { useEffect, useState } from 'react';
import { Spinner, Page, Card, Text, BlockStack } from '@shopify/polaris';
import FormPreservation from '@/lib/form-preservation';

export default function AuthBouncePage() {
  const [status, setStatus] = useState('Loading...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bounceWithSessionToken = async () => {
      try {
        setStatus('Initializing App Bridge...');

        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const shop = urlParams.get('shop');
        const host = urlParams.get('host');
        const redirectTo = urlParams.get('redirectTo') || '/dashboard';

        if (!shop || !host) {
          throw new Error('Missing required parameters (shop or host)');
        }

        // Wait for App Bridge to load (both modern and legacy)
        let retries = 0;
        const maxRetries = 100;

        while (!window.ShopifyBridge && !window.shopify && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }

        if (!window.ShopifyBridge && !window.shopify) {
          throw new Error('App Bridge failed to load after waiting');
        }

        setStatus('Checking App Bridge availability...');

        let sessionToken: string | null = null;

        // First try the modern App Bridge v4+ API
        if (window.ShopifyBridge && typeof window.ShopifyBridge.getSessionToken === 'function') {
          setStatus('Retrieving session token via App Bridge v4+ API...');
          try {
            sessionToken = await window.ShopifyBridge.getSessionToken();
          } catch (error) {
            // Silent fail, try legacy method
          }
        }

        // Fallback to legacy window.shopify.idToken
        if (!sessionToken && window.shopify && typeof window.shopify.idToken === 'function') {
          setStatus('Retrieving session token via legacy API...');
          try {
            sessionToken = await window.shopify.idToken();
          } catch (error) {
            // Silent fail, try createApp method
          }
        }

        // Fallback to legacy createApp if modern API didn't work
        if (!sessionToken && window.shopify && window.shopify.createApp) {
          setStatus('Falling back to legacy App Bridge API...');
          try {
            const app = window.shopify.createApp({
              apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
              host: host,
              forceRedirect: false,
            });

            if (app.idToken) {
              sessionToken = await app.idToken();
            } else if (app.getSessionToken) {
              sessionToken = await app.getSessionToken();
            }
          } catch (error) {
          }
        }

        if (!sessionToken) {
          // Try to get from URL as fallback
          sessionToken = urlParams.get('id_token');
        }

        if (!sessionToken) {
          throw new Error('Unable to retrieve session token from App Bridge or URL');
        }

        setStatus('Session token retrieved successfully!');

        // Check for preserved form data and pending requests
        const formPreservation = FormPreservation.getInstance();
        const pendingRequests = formPreservation.getPendingRequests();

        if (pendingRequests.length > 0) {
          setStatus(`Processing ${pendingRequests.length} pending requests...`);

          // Process pending requests with fresh token
          for (const request of pendingRequests) {
            try {
              const headers = new Headers();
              headers.set('Authorization', `Bearer ${sessionToken}`);
              headers.set('Content-Type', 'application/json');

              await fetch(request.url, {
                method: request.method,
                headers,
                body: request.body ? JSON.stringify(request.body) : undefined
              });
            } catch (error) {
              console.error('[AuthBounce] Failed to retry request:', error);
            }
          }
        }

        setStatus('Redirecting...');

        // Build redirect URL with session token and all original parameters
        const redirectUrl = new URL(redirectTo, window.location.origin);

        // Preserve all original URL parameters
        for (const [key, value] of urlParams.entries()) {
          if (key !== 'redirectTo') {
            redirectUrl.searchParams.set(key, value);
          }
        }

        // Add session token
        redirectUrl.searchParams.set('id_token', sessionToken);
        redirectUrl.searchParams.set('session_verified', 'true');
        redirectUrl.searchParams.set('bounced_at', Date.now().toString());
        redirectUrl.searchParams.set('form_preserved', formPreservation.getPreservedFormData() ? 'true' : 'false');

        // Small delay to show success message
        setTimeout(() => {
          window.location.href = redirectUrl.toString();
        }, 500);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
        setStatus('Authentication failed');

        // Fallback: redirect to dashboard with error flag after 3 seconds
        setTimeout(() => {
          const urlParams = new URLSearchParams(window.location.search);
          const redirectTo = urlParams.get('redirectTo') || '/dashboard';
          const redirectUrl = new URL(redirectTo, window.location.origin);

          // Preserve original parameters
          for (const [key, value] of urlParams.entries()) {
            if (key !== 'redirectTo') {
              redirectUrl.searchParams.set(key, value);
            }
          }

          redirectUrl.searchParams.set('auth_error', 'session_token_failed');
          window.location.href = redirectUrl.toString();
        }, 3000);
      }
    };

    bounceWithSessionToken();
  }, []);

  return (
    <Page title="Authenticating...">
      <Card>
        <BlockStack gap="400" align="center">
          <Spinner size="large" />
          <Text variant="headingMd" as="h2">
            {status}
          </Text>
          {error && (
            <Text variant="bodyMd" tone="critical" as="p">
              Error: {error}
            </Text>
          )}
          <Text variant="bodySm" tone="subdued" as="p">
            Please wait while we authenticate your session...
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}