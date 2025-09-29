'use client';

import { useState, useEffect } from 'react';
import { Page, Card, Button, Text, Banner, Spinner } from '@shopify/polaris';

/**
 * Modern Authentication Component using Token Exchange
 * Replaces legacy OAuth redirect flow with session token approach
 */
export default function ModernAuth() {
  const [authState, setAuthState] = useState<'loading' | 'authenticating' | 'authenticated' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [tokenExchangeResult, setTokenExchangeResult] = useState<any>(null);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const shop = urlParams.get('shop');
      const host = urlParams.get('host');
      const embedded = urlParams.get('embedded');


      if (!shop) {
        throw new Error('Shop parameter is required for authentication');
      }

      // Check if we're actually in the Shopify admin iframe
      const inShopifyAdmin = window.top !== window.self && host;


      if (inShopifyAdmin && embedded === '1') {
        try {
          // Try App Bridge with a shorter timeout
          await waitForAppBridge();
          await performTokenExchange();
        } catch (error) {
          console.warn('[ModernAuth] App Bridge failed, falling back to OAuth:', error);
          // If App Bridge fails, use legacy OAuth as fallback
          await performDirectTokenExchange();
        }
      } else {
        await performDirectTokenExchange();
      }

      setAuthState('authenticated');

    } catch (error: any) {
      console.error('[ModernAuth] Authentication failed:', error);
      setError(error.message);
      setAuthState('error');
    }
  };

  const waitForAppBridge = async (): Promise<void> => {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 30; // 3 seconds with 100ms intervals - shorter timeout

      const checkAppBridge = () => {
        attempts++;

        // Log current state for debugging
        if (attempts === 1 || attempts % 10 === 0) {
            shopifyExists: !!window.shopify,
            customAppExists: !!(window as any).__SHOPIFY_APP__,
            inIframe: window.top !== window.self
          });
        }

        // Check if App Bridge CDN is loaded and ready
        if (typeof window !== 'undefined' && window.shopify) {

          // Use a race condition with timeout
          Promise.race([
            window.shopify.ready,
            new Promise((_, reject) => setTimeout(() => reject(new Error('App Bridge ready timeout')), 2000))
          ]).then(() => {
            resolve();
          }).catch((error) => {
            console.error('[ModernAuth] App Bridge ready failed:', error);
            reject(error);
          });
          return;
        }

        // Check our custom instance as fallback
        const appInstance = (window as any).__SHOPIFY_APP__;
        if (appInstance && appInstance.ready) {
          resolve();
          return;
        }

        if (attempts >= maxAttempts) {
          console.error('[ModernAuth] ❌ App Bridge timeout after', attempts, 'attempts');
          console.error('[ModernAuth] Final state:', {
            shopifyExists: !!window.shopify,
            customAppExists: !!(window as any).__SHOPIFY_APP__,
            inIframe: window.top !== window.self,
            url: window.location.href
          });
          reject(new Error('App Bridge not available - ensure app is loaded within Shopify Admin'));
          return;
        }

        setTimeout(checkAppBridge, 100);
      };

      // Start checking
      checkAppBridge();
    });
  };

  const performTokenExchange = async () => {
    setAuthState('authenticating');

    try {
      // Get session token from App Bridge (try both CDN and custom instance)
      let sessionToken;

      if (window.shopify && window.shopify.idToken) {
        sessionToken = await window.shopify.idToken();
      } else {
        const appInstance = (window as any).__SHOPIFY_APP__;
        if (!appInstance?.idToken) {
          throw new Error('Session token not available from either CDN or custom instance');
        }
        sessionToken = await appInstance.idToken();
      }

      // Exchange session token for access token
      const response = await fetch('/api/auth/token-exchange', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Token exchange failed');
      }

      const result = await response.json();

      setTokenExchangeResult(result);

      // If successful, redirect to dashboard
      if (result.success) {
        const urlParams = new URLSearchParams(window.location.search);
        window.location.href = `/dashboard?${urlParams.toString()}`;
      }

    } catch (error: any) {
      console.error('[ModernAuth] Token exchange failed:', error);
      throw error;
    }
  };

  const performDirectTokenExchange = async () => {
    setAuthState('authenticating');

    try {
      // For development/testing - redirect to legacy OAuth as fallback
      const urlParams = new URLSearchParams(window.location.search);
      const shop = urlParams.get('shop');

      console.warn('[ModernAuth] Falling back to legacy OAuth flow');
      window.location.href = `/api/auth?shop=${shop}&embedded=1`;

    } catch (error: any) {
      console.error('[ModernAuth] Direct token exchange failed:', error);
      throw error;
    }
  };

  const retryAuth = () => {
    setError(null);
    setTokenExchangeResult(null);
    setAuthState('loading');
    initializeAuth();
  };

  if (authState === 'loading') {
    return (
      <Page title="Initializing...">
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Spinner size="large" />
            <Text variant="bodyMd" as="p" tone="subdued">
              Setting up Stock Alert...
            </Text>
          </div>
        </Card>
      </Page>
    );
  }

  if (authState === 'authenticating') {
    return (
      <Page title="Authenticating...">
        <Card>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <Spinner size="large" />
            <Text variant="bodyMd" as="p" tone="subdued">
              Getting permissions from Shopify...
            </Text>
            <Text variant="bodySm" as="p" tone="subdued">
              This uses modern session token authentication
            </Text>
          </div>
        </Card>
      </Page>
    );
  }

  if (authState === 'error') {
    return (
      <Page title="Authentication Error">
        <Banner tone="critical">
          <Text variant="bodyMd" as="p">
            Authentication failed: {error}
          </Text>
        </Banner>

        <Card>
          <div style={{ padding: '1rem' }}>
            <Text variant="headingMd" as="h2">
              What happened?
            </Text>
            <Text variant="bodyMd" as="p">
              The app failed to authenticate using modern session token exchange. This could be due to:
            </Text>
            <ul>
              <li>App Bridge not loading properly</li>
              <li>Session token issues</li>
              <li>Token exchange endpoint problems</li>
              <li>Shopify API configuration issues</li>
            </ul>

            <div style={{ marginTop: '1rem' }}>
              <Button onClick={retryAuth} variant="primary">
                Try Again
              </Button>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  if (authState === 'authenticated') {
    return (
      <Page title="Authentication Successful">
        <Banner tone="success">
          <Text variant="bodyMd" as="p">
            ✅ Modern authentication completed successfully!
          </Text>
        </Banner>

        {tokenExchangeResult && (
          <Card>
            <Text variant="headingMd" as="h2">Authentication Details</Text>
            <div style={{ marginTop: '1rem' }}>
              <Text variant="bodyMd" as="p">
                <strong>Shop:</strong> {tokenExchangeResult.shop}
              </Text>
              <Text variant="bodyMd" as="p">
                <strong>Scopes:</strong> {tokenExchangeResult.scopes?.join(', ')}
              </Text>
              <Text variant="bodyMd" as="p">
                <strong>Can Function:</strong> {tokenExchangeResult.canFunction ? '✅ Yes' : '❌ No'}
              </Text>
              <Text variant="bodyMd" as="p">
                <strong>Message:</strong> {tokenExchangeResult.message}
              </Text>
            </div>
          </Card>
        )}
      </Page>
    );
  }

  return null;
}