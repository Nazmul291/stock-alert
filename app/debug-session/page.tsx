'use client';

import { useState, useEffect } from 'react';
import { Card, Page, Button, Badge, Layout, Banner } from '@shopify/polaris';
import { useAppBridgeContext } from '@/components/app-bridge-provider';
import { getSessionToken, getSessionTokenFromURL } from '@/hooks/useAppBridge';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';

export default function DebugSession() {
  const { appBridge, isReady } = useAppBridgeContext();
  const authenticatedFetch = useAuthenticatedFetch();

  interface SessionData {
    appBridgeReady: boolean;
    sessionToken: string | null;
    tokenSource: 'url' | 'app-bridge' | null;
    tokenDecoded: any | null;
    apiTestResult: any | null;
    error: string | null;
    timestamp: string | null;
  }

  const [sessionData, setSessionData] = useState<SessionData>({
    appBridgeReady: false,
    sessionToken: null,
    tokenSource: null,
    tokenDecoded: null,
    apiTestResult: null,
    error: null,
    timestamp: null,
  });

  const [isLoading, setIsLoading] = useState(false);

  // Check for URL token immediately on mount
  useEffect(() => {
    const urlToken = getSessionTokenFromURL();
    if (urlToken) {
      console.log('✅ Found id_token in URL on page load');
      // Decode it immediately for display
      try {
        const parts = urlToken.split('.');
        if (parts.length === 3) {
          const decoded = JSON.parse(atob(parts[1]));
          setSessionData(prev => ({
            ...prev,
            sessionToken: urlToken,
            tokenSource: 'url',
            tokenDecoded: decoded,
          }));
        }
      } catch (e) {
        console.error('Failed to decode URL token:', e);
      }
    }
  }, []);

  // Check App Bridge initialization
  useEffect(() => {
    setSessionData(prev => ({
      ...prev,
      appBridgeReady: isReady,
    }));
  }, [isReady]);

  // Function to get and decode session token
  const testSessionToken = async () => {
    setIsLoading(true);
    try {
      // Step 1: First check for URL token
      const urlToken = getSessionTokenFromURL();
      let token: string | null = null;
      let tokenSource: 'url' | 'app-bridge' | null = null;

      if (urlToken) {
        token = urlToken;
        tokenSource = 'url';
        console.log('✅ Using session token from URL (id_token parameter)');
      } else if (isReady && appBridge) {
        // Step 2: Try App Bridge if no URL token
        console.log('Getting session token from App Bridge...');
        const appToken = await getSessionToken(appBridge);
        if (appToken) {
          token = appToken;
          tokenSource = 'app-bridge';
        }
      }

      if (!token) {
        throw new Error('No session token available from URL or App Bridge');
      }

      console.log(`Session token retrieved (source: ${tokenSource}):`, token.substring(0, 50) + '...');

      // Step 3: Decode token (without verification, just to see contents)
      const parts = token.split('.');
      let decoded = null;
      if (parts.length === 3) {
        try {
          decoded = JSON.parse(atob(parts[1]));
          console.log('Decoded token:', decoded);
        } catch (e) {
          console.error('Failed to decode token:', e);
        }
      }

      // Step 4: Test API call with session token
      console.log('Testing API call with session token...');
      const response = await fetch('/api/shopify-check', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
      });

      const apiResult = await response.json();
      console.log('API test result:', apiResult);

      // Step 5: Test authenticated fetch
      console.log('Testing authenticated fetch...');
      const authResponse = await authenticatedFetch('/api/shopify-check', {
        method: 'POST',
        body: JSON.stringify({ authenticatedFetch: true }),
      });

      const authResult = await authResponse.json();
      console.log('Authenticated fetch result:', authResult);

      setSessionData({
        appBridgeReady: isReady,
        sessionToken: token,
        tokenSource: tokenSource,
        tokenDecoded: decoded,
        apiTestResult: { manual: apiResult, authenticated: authResult },
        error: null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Session test error:', error);
      setSessionData(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      }));
    } finally {
      setIsLoading(false);
    }
  };

  // Function to check browser info
  const getBrowserInfo = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      url: window.location.href,
      shop: params.get('shop'),
      host: params.get('host'),
      embedded: params.get('embedded'),
      userAgent: navigator.userAgent,
      isIframe: window !== window.top,
    };
  };

  const browserInfo = getBrowserInfo();

  return (
    <Page title="Session Token Debugger">
      <Layout>
        {sessionData.error && (
          <Layout.Section>
            <Banner tone="critical" title="Error">
              {sessionData.error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
                App Bridge Status
              </h2>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <Badge tone={isReady ? 'success' : 'warning'}>
                  {`App Bridge: ${isReady ? 'Ready' : 'Not Ready'}`}
                </Badge>
                <Badge tone={sessionData.sessionToken ? 'success' : 'attention'}>
                  {`Session Token: ${sessionData.sessionToken ? 'Available' : 'Not Available'}`}
                </Badge>
                {sessionData.tokenSource && (
                  <Badge tone="info">
                    {`Source: ${sessionData.tokenSource === 'url' ? 'URL (id_token)' : 'App Bridge'}`}
                  </Badge>
                )}
              </div>
              <Button variant="primary" onClick={testSessionToken} loading={isLoading}>
                Test Session Token Generation
              </Button>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
                Browser Information
              </h2>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', background: '#f5f5f5', padding: '12px', borderRadius: '4px' }}>
                <div><strong>URL:</strong> {browserInfo.url}</div>
                <div><strong>Shop:</strong> {browserInfo.shop || 'Not set'}</div>
                <div><strong>Host:</strong> {browserInfo.host || 'Not set'}</div>
                <div><strong>Embedded:</strong> {browserInfo.embedded || 'Not set'}</div>
                <div><strong>Is iFrame:</strong> {browserInfo.isIframe ? 'Yes' : 'No'}</div>
                <div><strong>User Agent:</strong> {browserInfo.userAgent}</div>
              </div>
            </div>
          </Card>
        </Layout.Section>

        {sessionData.sessionToken && (
          <Layout.Section>
            <Card>
              <div style={{ padding: '20px' }}>
                <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
                  Session Token Details
                </h2>
                <div style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Token (first 100 chars):</strong>
                    <div style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', wordBreak: 'break-all', marginTop: '4px' }}>
                      {sessionData.sessionToken.substring(0, 100)}...
                    </div>
                  </div>

                  {sessionData.tokenDecoded && (
                    <div style={{ marginBottom: '12px' }}>
                      <strong>Decoded Token:</strong>
                      <pre style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', overflow: 'auto', marginTop: '4px' }}>
                        {JSON.stringify(sessionData.tokenDecoded, null, 2)}
                      </pre>
                    </div>
                  )}

                  {sessionData.apiTestResult && (
                    <div>
                      <strong>API Test Results:</strong>
                      <pre style={{ background: '#f5f5f5', padding: '8px', borderRadius: '4px', overflow: 'auto', marginTop: '4px' }}>
                        {JSON.stringify(sessionData.apiTestResult, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div style={{ marginTop: '12px', color: '#666' }}>
                    Last tested: {sessionData.timestamp || 'Never'}
                  </div>
                </div>
              </div>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <h2 style={{ marginBottom: '16px', fontSize: '18px', fontWeight: 'bold' }}>
                How to Verify Session Tokens
              </h2>
              <ol style={{ marginLeft: '20px', lineHeight: '1.6' }}>
                <li>Open your app from Shopify Admin (not direct URL)</li>
                <li>Click "Test Session Token Generation" button above</li>
                <li>Check if token is generated and decoded successfully</li>
                <li>Look for "dest" field in decoded token - should contain your shop URL</li>
                <li>Check API test results - should show "authenticated": true</li>
                <li>Open browser DevTools Console to see detailed logs</li>
              </ol>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}