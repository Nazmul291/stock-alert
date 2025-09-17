'use client';

import { useEffect, useState } from 'react';
import { useAppBridgeContext } from './app-bridge-provider';
import { getSessionToken, getSessionTokenFromURL } from '@/hooks/useAppBridge';

export default function SessionTokenTest() {
  const { appBridge, isReady } = useAppBridgeContext();
  const [token, setToken] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<'url' | 'app-bridge' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiCalls, setApiCalls] = useState<number>(0);
  const [lastCall, setLastCall] = useState<string>('');

  useEffect(() => {
    const testToken = async () => {
      setIsLoading(true);
      try {
        // First check for URL token
        const urlToken = getSessionTokenFromURL();
        if (urlToken) {
          setToken(urlToken);
          setTokenSource('url');
          console.log('✅ Session token from URL (id_token):', urlToken.substring(0, 20) + '...');
        } else if (isReady && appBridge) {
          // Fall back to App Bridge
          const sessionToken = await getSessionToken(appBridge);
          if (sessionToken) {
            setToken(sessionToken);
            setTokenSource('app-bridge');
            console.log('✅ Session token from App Bridge:', sessionToken.substring(0, 20) + '...');
          }
        }

        // Decode token to show shop
        if (token || urlToken) {
          const activeToken = token || urlToken;
          try {
            const parts = activeToken!.split('.');
            if (parts.length === 3) {
              const decoded = JSON.parse(atob(parts[1]));
              console.log('✅ Token decoded - Shop:', decoded.dest);
            }
          } catch (e) {
            console.error('Failed to decode token');
          }

          // Test API call with session token
          const tokenForApi = token || urlToken;
          if (tokenForApi) {
            const response = await fetch('/api/shopify-check', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${tokenForApi}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ test: true }),
            });

            console.log('✅ API call with session token - Status:', response.status);
            setApiCalls(prev => prev + 1);
            setLastCall(new Date().toLocaleTimeString());
          }
        } else if (!token && !urlToken) {
          setError('No session token available');
          console.error('❌ No session token available');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('❌ Session token error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    testToken();

    // Re-test every 30 seconds
    const interval = setInterval(testToken, 30000);
    return () => clearInterval(interval);
  }, [appBridge, isReady]);

  // Only render in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const shop = params.get('shop');
  const host = params.get('host');
  const idTokenParam = params.get('id_token');

  return (
    <div style={{
      position: 'fixed',
      bottom: 10,
      right: 10,
      padding: 10,
      background: token ? '#d4f4dd' : error ? '#ffd4d4' : '#f0f0f0',
      border: '1px solid',
      borderColor: token ? '#4caf50' : error ? '#f44336' : '#ccc',
      borderRadius: 5,
      fontSize: 11,
      maxWidth: 320,
      zIndex: 9999,
      fontFamily: 'monospace'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 12 }}>
        🔐 Session Token Monitor
      </div>
      <div>Shop: {shop || '❌ Missing'}</div>
      <div>Host: {host ? '✅ Present' : '❌ Missing'}</div>
      <div>id_token in URL: {idTokenParam ? '✅ Present' : '❌ Missing'}</div>
      <div>App Bridge: {isReady ? '✅ Ready' : '⚠️ Not Required'}</div>
      <div>Session Token: {token ? `✅ Active (${tokenSource})` : isLoading ? '⏳ Loading...' : '❌ None'}</div>
      {apiCalls > 0 && (
        <>
          <div>API Calls Made: {apiCalls}</div>
          <div>Last Call: {lastCall}</div>
        </>
      )}
      {error && (
        <div style={{ color: '#d32f2f', marginTop: 5, fontSize: 10 }}>
          Error: {error}
        </div>
      )}
      <div style={{ marginTop: 5, fontSize: 10, color: '#666' }}>
        Auto-refresh every 30s
      </div>
      <a
        href="/debug-session"
        style={{
          display: 'inline-block',
          marginTop: 5,
          color: '#1976d2',
          textDecoration: 'underline'
        }}
      >
        Open Full Debugger →
      </a>
    </div>
  );
}