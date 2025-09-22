'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function SessionMonitor() {
  const [status, setStatus] = useState<any>({});
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkSession = async () => {
      const sessionToken = searchParams.get('id_token');

      if (!sessionToken) {
        setStatus({ error: 'No session token in URL' });
        return;
      }

      try {
        const response = await fetch('/api/session-check', {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        });

        const result = await response.json();
        setStatus({
          status: response.status,
          ok: response.ok,
          result,
          tokenLength: sessionToken.length,
          hasAppBridge: !!window.shopify
        });
      } catch (error) {
        setStatus({
          error: 'Failed to check session',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    };

    checkSession();
    // Check every 30 seconds
    const interval = setInterval(checkSession, 30000);
    return () => clearInterval(interval);
  }, [searchParams]);

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: 'white',
      border: '2px solid #ccc',
      borderRadius: '8px',
      padding: '15px',
      zIndex: 9999,
      maxWidth: '400px',
      fontSize: '12px',
      fontFamily: 'monospace'
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
        Session Monitor (What Shopify Sees)
      </div>

      <div style={{ marginBottom: '5px' }}>
        <strong>App Bridge:</strong> {status.hasAppBridge ? '✅ Loaded' : '❌ Missing'}
      </div>

      <div style={{ marginBottom: '5px' }}>
        <strong>Session Token:</strong> {status.tokenLength ? `✅ ${status.tokenLength} chars` : '❌ Missing'}
      </div>

      <div style={{ marginBottom: '5px' }}>
        <strong>API Response:</strong> {
          status.ok ? '✅ 200 OK' :
          status.status ? `❌ ${status.status}` : '⏳ Checking...'
        }
      </div>

      {status.result && (
        <div style={{ marginTop: '10px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
          <strong>Details:</strong>
          <pre style={{ margin: 0, fontSize: '10px', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(status.result, null, 2)}
          </pre>
        </div>
      )}

      {status.error && (
        <div style={{ marginTop: '10px', color: 'red' }}>
          <strong>Error:</strong> {status.error}
          {status.details && <div>{status.details}</div>}
        </div>
      )}
    </div>
  );
}