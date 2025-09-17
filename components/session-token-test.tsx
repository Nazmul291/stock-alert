'use client';

import { useEffect, useState } from 'react';
import { useAppBridgeContext } from './app-bridge-provider';
import { getSessionToken } from '@/hooks/useAppBridge';

export default function SessionTokenTest() {
  const { appBridge, isReady } = useAppBridgeContext();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const testToken = async () => {
      if (!isReady || !appBridge) {
        return;
      }

      setIsLoading(true);
      try {
        const sessionToken = await getSessionToken(appBridge);
        if (sessionToken) {
          setToken(sessionToken);
          console.log('Session token retrieved:', sessionToken.substring(0, 20) + '...');

          // Test API call with session token
          const response = await fetch('/api/auth/verify', {
            headers: {
              'Authorization': `Bearer ${sessionToken}`
            }
          });

          console.log('API call with session token status:', response.status);
        } else {
          setError('No session token available');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    testToken();
  }, [appBridge, isReady]);

  // Only render in development
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 10,
      right: 10,
      padding: 10,
      background: '#f0f0f0',
      border: '1px solid #ccc',
      borderRadius: 5,
      fontSize: 12,
      maxWidth: 300,
      zIndex: 9999
    }}>
      <strong>Session Token Debug:</strong>
      <div>App Bridge Ready: {isReady ? '✅' : '❌'}</div>
      <div>Token: {token ? '✅ Retrieved' : isLoading ? '⏳ Loading...' : '❌ Not retrieved'}</div>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
    </div>
  );
}