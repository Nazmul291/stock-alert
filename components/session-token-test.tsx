'use client';

import { useEffect, useState } from 'react';
// Using session-helpers and token manager instead of separate hook
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import { Card, Text, Badge, Button, BlockStack } from '@shopify/polaris';

/**
 * Component to actively demonstrate session token usage for Shopify's automated checks
 * This component makes authenticated API calls using session tokens
 */
export function SessionTokenTest() {
  // Using global App Bridge instance instead of hook
  const authenticatedFetch = useAuthenticatedFetch();
  const [sessionTokenStatus, setSessionTokenStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [apiCallStatus, setApiCallStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [lastTokenTest, setLastTokenTest] = useState<string | null>(null);
  const [appBridgeReady, setAppBridgeReady] = useState(false);

  useEffect(() => {
    // Define testAuthenticatedCall first to avoid hoisting issues
    const testAuthenticatedCall = async () => {
      try {
        // Test our auth-test endpoint
        const response = await authenticatedFetch('/api/shopify/auth-test');
        const data = await response.json();

        if (response.ok && data.authenticated) {
          setApiCallStatus('success');
          console.log('[SessionTokenTest] Authenticated API call successful:', data);
        } else {
          setApiCallStatus('error');
          console.warn('[SessionTokenTest] Authenticated API call failed:', data);
        }
      } catch (error) {
        setApiCallStatus('error');
        console.error('[SessionTokenTest] Authenticated API call error:', error);
      }
    };

    // Test session token retrieval - define first to avoid hoisting issues
    const testSessionToken = async () => {
      try {
        const appBridge = (window as any).__SHOPIFY_APP__;
        if (appBridge && appBridge.idToken) {
          const token = await appBridge.idToken();
          if (token) {
            setSessionTokenStatus('success');
            setLastTokenTest(new Date().toISOString());
            console.log('[SessionTokenTest] Session token test successful');

            // Test authenticated API call
            await testAuthenticatedCall();
          } else {
            setSessionTokenStatus('error');
            console.warn('[SessionTokenTest] Session token test failed - no token');
          }
        } else {
          setSessionTokenStatus('error');
          console.warn('[SessionTokenTest] App Bridge not ready');
        }
      } catch (error) {
        setSessionTokenStatus('error');
        console.error('[SessionTokenTest] Session token test error:', error);
      }
    };

    // Check for App Bridge readiness and set up polling
    const checkAppBridgeReady = () => {
      const appBridge = (window as any).__SHOPIFY_APP__;
      if (appBridge && appBridge.ready) {
        setAppBridgeReady(true);
        return true;
      }
      return false;
    };

    let interval: NodeJS.Timeout | null = null;

    // Try immediately
    if (checkAppBridgeReady()) {
      testSessionToken();
      // Repeat the test every 30 seconds
      interval = setInterval(testSessionToken, 30 * 1000);
    } else {
      // Poll for App Bridge readiness
      const readinessInterval = setInterval(() => {
        if (checkAppBridgeReady()) {
          clearInterval(readinessInterval);
          testSessionToken();
          // Start regular testing once ready
          interval = setInterval(testSessionToken, 30 * 1000);
        }
      }, 1000); // Check every second

      // Stop checking after 30 seconds
      const stopTimeout = setTimeout(() => clearInterval(readinessInterval), 30000);

      return () => {
        clearInterval(readinessInterval);
        clearTimeout(stopTimeout);
        if (interval) clearInterval(interval);
      };
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [authenticatedFetch]);

  const handleManualTest = async () => {
    setSessionTokenStatus('loading');
    setApiCallStatus('loading');

    try {
      const appBridge = (window as any).__SHOPIFY_APP__;
      if (appBridge && appBridge.idToken) {
        const token = await appBridge.idToken();
        if (token) {
        setSessionTokenStatus('success');
        setLastTokenTest(new Date().toISOString());

        // Test API call
        const response = await authenticatedFetch('/api/shopify/auth-test');
        const data = await response.json();

        if (response.ok && data.authenticated) {
          setApiCallStatus('success');
          } else {
            setApiCallStatus('error');
          }
        } else {
          setSessionTokenStatus('error');
        }
      } else {
        setSessionTokenStatus('error');
      }
    } catch (error) {
      setSessionTokenStatus('error');
      setApiCallStatus('error');
    }
  };

  // Show loading state while App Bridge is not ready
  if (!appBridgeReady) {
    return (
      <Card>
        <BlockStack gap="200">
          <Text variant="headingMd" as="h3">Session Token Status</Text>
          <Badge tone="info">App Bridge Loading...</Badge>
          <Text variant="bodySm" tone="subdued">
            Waiting for Shopify App Bridge to initialize...
          </Text>
        </BlockStack>
      </Card>
    );
  }

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h3">Session Token Status</Text>

        <BlockStack gap="200">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text>Session Token Retrieval:</Text>
            <Badge tone={sessionTokenStatus === 'success' ? 'success' : sessionTokenStatus === 'error' ? 'critical' : 'info'}>
              {sessionTokenStatus === 'success' ? 'Working' : sessionTokenStatus === 'error' ? 'Failed' : 'Testing...'}
            </Badge>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text>Authenticated API Calls:</Text>
            <Badge tone={apiCallStatus === 'success' ? 'success' : apiCallStatus === 'error' ? 'critical' : 'info'}>
              {apiCallStatus === 'success' ? 'Working' : apiCallStatus === 'error' ? 'Failed' : 'Testing...'}
            </Badge>
          </div>

          {lastTokenTest && (
            <Text variant="bodySm" tone="subdued">
              Last successful test: {new Date(lastTokenTest).toLocaleTimeString()}
            </Text>
          )}

          <Button onClick={handleManualTest} size="slim">
            Test Session Token
          </Button>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}