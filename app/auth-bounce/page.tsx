'use client';

import { useEffect, useState } from 'react';
import { Spinner, Page, Card, Text, BlockStack } from '@shopify/polaris';

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

        // Wait for App Bridge to load
        let retries = 0;
        const maxRetries = 50;

        while (!window.shopify && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100));
          retries++;
        }

        if (!window.shopify) {
          throw new Error('App Bridge failed to load after waiting');
        }

        setStatus('Checking App Bridge availability...');

        // Modern API - directly use window.shopify.idToken
        let sessionToken: string | null = null;

        // First try the modern API
        if (window.shopify && typeof window.shopify.idToken === 'function') {
          setStatus('Retrieving session token via modern API...');
          try {
            sessionToken = await window.shopify.idToken();
          } catch (error) {
            // Silent fail, try legacy method
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

        setStatus('Session token retrieved successfully! Redirecting...');

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
            <Text variant="bodyMd" tone="critical">
              Error: {error}
            </Text>
          )}
          <Text variant="bodySm" tone="subdued">
            Please wait while we authenticate your session...
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}