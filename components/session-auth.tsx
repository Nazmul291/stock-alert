'use client';

import { useState, useEffect } from 'react';
import { Page, Card, Button, Text, Banner, Spinner, List } from '@shopify/polaris';

/**
 * Modern Session Token Authentication Component
 * Uses App Bridge session tokens for authentication - no OAuth redirects needed
 */
export default function SessionAuth() {
  const [authState, setAuthState] = useState<'loading' | 'authenticating' | 'authenticated' | 'needs_install' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [authResult, setAuthResult] = useState<any>(null);

  useEffect(() => {
    initializeSessionAuth();
  }, []);

  const initializeSessionAuth = async () => {
    console.log('[SessionAuth] Starting session token authentication...');

    try {
      // Wait for App Bridge to be ready
      await waitForAppBridge();

      // Perform session token authentication
      await performSessionAuth();

    } catch (error: any) {
      console.error('[SessionAuth] Authentication failed:', error);
      setError(error.message);

      // Check if we need installation
      if (error.message.includes('needs installation') || error.message.includes('403')) {
        setAuthState('needs_install');
      } else {
        setAuthState('error');
      }
    }
  };

  const waitForAppBridge = async (): Promise<void> => {
    console.log('[SessionAuth] Waiting for App Bridge...');

    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds

      const checkAppBridge = () => {
        attempts++;

        // Check if App Bridge CDN is loaded
        if (typeof window !== 'undefined' && window.shopify) {
          console.log('[SessionAuth] ✅ App Bridge CDN ready');
          resolve();
          return;
        }

        // Check custom App Bridge instance
        const appInstance = (window as any).__SHOPIFY_APP__;
        if (appInstance && appInstance.ready) {
          console.log('[SessionAuth] ✅ Custom App Bridge ready');
          resolve();
          return;
        }

        if (attempts >= maxAttempts) {
          console.error('[SessionAuth] ❌ App Bridge timeout');
          reject(new Error('App Bridge not available - ensure app is loaded within Shopify Admin'));
          return;
        }

        if (attempts % 10 === 0) {
          console.log(`[SessionAuth] Still waiting... (${attempts}/${maxAttempts})`);
        }

        setTimeout(checkAppBridge, 100);
      };

      checkAppBridge();
    });
  };

  const performSessionAuth = async () => {
    console.log('[SessionAuth] Performing session token authentication...');
    setAuthState('authenticating');

    try {
      // Get session token from App Bridge
      let sessionToken;

      if (window.shopify && window.shopify.idToken) {
        console.log('[SessionAuth] Getting session token from App Bridge CDN...');
        sessionToken = await window.shopify.idToken();
      } else {
        const appInstance = (window as any).__SHOPIFY_APP__;
        if (!appInstance?.idToken) {
          throw new Error('Session token not available');
        }
        console.log('[SessionAuth] Getting session token from custom App Bridge...');
        sessionToken = await appInstance.idToken();
      }

      console.log('[SessionAuth] Session token acquired, authenticating...');

      // Call our session authentication endpoint
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();

      if (response.ok && result.success) {
        console.log('[SessionAuth] ✅ Authentication successful!');
        setAuthResult(result);
        setAuthState('authenticated');

        // Redirect to dashboard immediately after successful authentication
        const urlParams = new URLSearchParams(window.location.search);
        window.location.href = `/?${urlParams.toString()}`;

      } else {
        console.error('[SessionAuth] Authentication failed:', result);

        if (result.needsInstallation || response.status === 401 || response.status === 403) {
          setAuthState('needs_install');
          setError('App needs to be installed first');
        } else {
          setAuthState('error');
          setError(result.error || result.message || 'Authentication failed');
        }
      }

    } catch (error: any) {
      console.error('[SessionAuth] Session authentication error:', error);
      throw error;
    }
  };

  const handleInstallApp = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const shop = urlParams.get('shop');

    if (shop) {
      // Redirect to legacy OAuth for initial installation
      window.location.href = `/api/auth?shop=${shop}&embedded=1`;
    } else {
      setError('Shop parameter missing');
    }
  };

  const retryAuth = () => {
    setError(null);
    setAuthResult(null);
    setAuthState('loading');
    initializeSessionAuth();
  };

  if (authState === 'loading') {
    return (
      <Page title="">
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <Spinner size="large" />
            <div style={{ marginTop: '1.5rem' }}>
              <Text variant="headingMd" as="h2">
                Setting up Stock Alert
              </Text>
              <Text variant="bodyMd" as="p" tone="subdued" style={{ marginTop: '0.5rem' }}>
                Please wait while we configure your inventory monitoring...
              </Text>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  if (authState === 'authenticating') {
    return (
      <Page title="">
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <Spinner size="large" />
            <div style={{ marginTop: '1.5rem' }}>
              <Text variant="headingMd" as="h2">
                Connecting to your store
              </Text>
              <Text variant="bodyMd" as="p" tone="subdued" style={{ marginTop: '0.5rem' }}>
                Establishing secure connection with Shopify...
              </Text>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  if (authState === 'needs_install') {
    return (
      <Page title="Complete Installation">
        <Banner tone="info">
          <Text variant="bodyMd" as="p">
            Let's complete your Stock Alert installation!
          </Text>
        </Banner>

        <Card>
          <div style={{ padding: '1rem' }}>
            <Text variant="headingMd" as="h2">
              Activate Stock Alert
            </Text>
            <Text variant="bodyMd" as="p">
              Click below to activate Stock Alert and start monitoring your inventory.
            </Text>

            <div style={{ marginTop: '1rem' }}>
              <Button onClick={handleInstallApp} variant="primary">
                Activate Now
              </Button>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  if (authState === 'error') {
    return (
      <Page title="Setup in Progress">
        <Banner tone="info">
          <Text variant="bodyMd" as="p">
            We're working on getting you connected...
          </Text>
        </Banner>

        <Card>
          <div style={{ padding: '1rem' }}>
            <Text variant="headingMd" as="h2">
              Let's get you connected
            </Text>
            <Text variant="bodyMd" as="p">
              Please try connecting again to complete your Stock Alert setup.
            </Text>

            <div style={{ marginTop: '1rem' }}>
              <Button onClick={retryAuth} variant="primary">
                Continue Setup
              </Button>
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  if (authState === 'authenticated') {
    return (
      <Page title="">
        <Card>
          <div style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ color: '#008060', marginBottom: '1rem' }}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="currentColor">
                <path d="M20.285 2l-11.285 11.567-5.286-5.011-3.714 3.716 9 8.728 15-15.285z"/>
              </svg>
            </div>
            <Text variant="headingMd" as="h2">
              Stock Alert is ready!
            </Text>
            <Text variant="bodyMd" as="p" tone="subdued" style={{ marginTop: '0.5rem' }}>
              Taking you to your dashboard...
            </Text>
            <div style={{ marginTop: '1.5rem' }}>
              <Spinner size="small" />
            </div>
          </div>
        </Card>
      </Page>
    );
  }

  return null;
}