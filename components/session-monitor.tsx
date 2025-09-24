'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSessionToken, getSessionTokenFromURL } from '@/hooks/session-helpers';
import { useAppBridge } from '@/components/app-bridge-provider';

export default function SessionMonitor() {
  const [status, setStatus] = useState<any>({});
  const searchParams = useSearchParams();
  const { appBridge, isReady } = useAppBridge();

  useEffect(() => {
    const checkSession = async () => {
      try {
        // Try to get fresh session token (App Bridge first for fresh tokens)
        let sessionToken: string | null = null;
        let tokenSource = 'None';

        // Check if we have a URL token and if it's close to expiring
        const urlToken = getSessionTokenFromURL();
        let shouldRefreshFromAppBridge = false;

        if (urlToken) {
          try {
            const tokenParts = urlToken.split('.');
            if (tokenParts.length === 3) {
              const payload = JSON.parse(atob(tokenParts[1]));
              const now = Math.floor(Date.now() / 1000);
              const timeUntilExpiry = payload.exp ? payload.exp - now : null;

              // If token expires in less than 2 minutes, try to get fresh one from App Bridge
              shouldRefreshFromAppBridge = timeUntilExpiry !== null && timeUntilExpiry < 120;
            }
          } catch (e) {
            // URL token is malformed, definitely try App Bridge
            shouldRefreshFromAppBridge = true;
          }
        }

        // Try App Bridge first if we need fresh tokens or no URL token
        if ((shouldRefreshFromAppBridge || !urlToken) && isReady && appBridge) {
          try {
            // Force refresh when tokens are close to expiring
            sessionToken = await getSessionToken(appBridge, shouldRefreshFromAppBridge);
            if (sessionToken) {
              tokenSource = shouldRefreshFromAppBridge ? 'App Bridge (Forced)' : 'App Bridge (Fresh)';
            }
          } catch (error) {
            // App Bridge token fetch failed, fall back to URL token
          }
        }

        // Fall back to URL token if App Bridge failed or we're using existing valid token
        if (!sessionToken && urlToken) {
          sessionToken = urlToken;
          tokenSource = shouldRefreshFromAppBridge ? 'URL (Stale)' : 'URL';
        }

        if (!sessionToken) {
          setStatus({
            error: 'No session token available',
            hasAppBridge: !!window.shopify || !!window.ShopifyBridge,
            appBridgeReady: isReady
          });
          return;
        }

        // Decode JWT to check expiration
        let tokenInfo = null;
        try {
          const tokenParts = sessionToken.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            const now = Math.floor(Date.now() / 1000);
            const timeUntilExpiry = payload.exp ? payload.exp - now : null;
            const isExpired = payload.exp ? payload.exp < now : false;

            tokenInfo = {
              exp: payload.exp,
              iat: payload.iat,
              timeUntilExpiry: timeUntilExpiry,
              isExpired: isExpired,
              shop: payload.dest ? new URL(payload.dest).hostname : null
            };

            // Emergency refresh if token is expired and we have App Bridge
            if (isExpired && isReady && appBridge) {
              try {
                const emergencyToken = await getSessionToken(appBridge, true);
                if (emergencyToken && emergencyToken !== sessionToken) {
                  sessionToken = emergencyToken;
                  tokenSource = 'App Bridge (Emergency)';

                  // Re-decode the emergency token
                  const emergencyParts = emergencyToken.split('.');
                  if (emergencyParts.length === 3) {
                    const emergencyPayload = JSON.parse(atob(emergencyParts[1]));
                    const emergencyTimeUntilExpiry = emergencyPayload.exp ? emergencyPayload.exp - now : null;
                    tokenInfo = {
                      exp: emergencyPayload.exp,
                      iat: emergencyPayload.iat,
                      timeUntilExpiry: emergencyTimeUntilExpiry,
                      isExpired: emergencyPayload.exp ? emergencyPayload.exp < now : false,
                      shop: emergencyPayload.dest ? new URL(emergencyPayload.dest).hostname : null
                    };
                  }
                }
              } catch (error) {
                // Emergency refresh failed
              }
            }
          }
        } catch (e) {
          tokenInfo = { error: 'Failed to decode token' };
        }

        // Make parallel requests - our API and Shopify Admin API
        const [sessionResponse, shopifyResponse, graphqlResponse] = await Promise.all([
          // 1. Our session check endpoint
          fetch('/api/session-check', {
            headers: {
              'Authorization': `Bearer ${sessionToken}`,
              'Content-Type': 'application/json'
            }
          }),

          // 2. Shopify Admin API verification
          fetch('/api/shopify/verify-session', {
            headers: {
              'Authorization': `Bearer ${sessionToken}`,
              'Content-Type': 'application/json'
            }
          }).catch(err => ({ ok: false, error: err.message })),

          // 3. GraphQL query to Shopify
          fetch('/api/shopify/graphql', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sessionToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              query: `
                query monitorCheck {
                  shop {
                    id
                    name
                    primaryDomain {
                      url
                    }
                  }
                }
              `
            })
          }).catch(err => ({ ok: false, error: err.message }))
        ]);

        const sessionResult = await sessionResponse.json();
        const shopifyResult = shopifyResponse.ok && !shopifyResponse.error ?
          await (shopifyResponse as Response).json() :
          { error: shopifyResponse.error || 'Failed' };
        const graphqlResult = graphqlResponse.ok && !graphqlResponse.error ?
          await (graphqlResponse as Response).json() :
          { error: graphqlResponse.error || 'Failed' };

        // Log to console for Shopify detection
        console.log('[SessionMonitor] Session check completed:', {
          sessionCheck: sessionResponse.ok,
          shopifyAdmin: shopifyResponse.ok,
          graphql: graphqlResponse.ok,
          tokenUsed: true,
          timestamp: new Date().toISOString()
        });

        setStatus({
          status: sessionResponse.status,
          ok: sessionResponse.ok,
          result: sessionResult,
          shopifyAdminCheck: shopifyResult,
          graphqlCheck: graphqlResult,
          tokenLength: sessionToken.length,
          hasAppBridge: !!window.shopify || !!window.ShopifyBridge,
          appBridgeReady: isReady,
          tokenSource: tokenSource,
          tokenInfo: tokenInfo,
          checksPerformed: {
            session: sessionResponse.ok,
            shopifyAdmin: shopifyResponse.ok,
            graphql: graphqlResponse.ok
          }
        });
      } catch (error) {
        setStatus({
          error: 'Failed to check session',
          details: error instanceof Error ? error.message : 'Unknown error',
          hasAppBridge: !!window.shopify || !!window.ShopifyBridge,
          appBridgeReady: isReady
        });
      }
    };

    checkSession();
    // Check every 15 seconds for more aggressive monitoring
    const interval = setInterval(checkSession, 15000);
    return () => clearInterval(interval);
  }, [searchParams, appBridge, isReady]);

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
        {status.checksPerformed && (
          <span style={{
            marginLeft: '10px',
            padding: '2px 6px',
            background: '#4CAF50',
            color: 'white',
            borderRadius: '3px',
            fontSize: '10px',
            animation: 'pulse 1s infinite'
          }}>
            ACTIVE
          </span>
        )}
      </div>
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>

      <div style={{ marginBottom: '5px' }}>
        <strong>App Bridge:</strong> {status.hasAppBridge ? '✅ Loaded' : '❌ Missing'}
        {status.appBridgeReady !== undefined && (
          <span style={{ marginLeft: '5px', fontSize: '10px' }}>
            ({status.appBridgeReady ? 'Ready' : 'Initializing'})
          </span>
        )}
      </div>

      <div style={{ marginBottom: '5px' }}>
        <strong>Session Token:</strong> {status.tokenLength ? `✅ ${status.tokenLength} chars` : '❌ Missing'}
        {status.tokenSource && (
          <span style={{ marginLeft: '5px', fontSize: '10px' }}>
            (from {status.tokenSource})
          </span>
        )}
      </div>

      <div style={{ marginBottom: '5px' }}>
        <strong>API Checks:</strong>
        <div style={{ marginLeft: '10px', fontSize: '10px' }}>
          <div>Session: {
            status.ok ? '✅ OK' :
            status.status ? `❌ ${status.status}` : '⏳ ...'
          }</div>
          <div>Shopify Admin: {
            status.checksPerformed?.shopifyAdmin ? '✅ OK' :
            status.checksPerformed?.shopifyAdmin === false ? '❌ Failed' : '⏳ ...'
          }</div>
          <div>GraphQL: {
            status.checksPerformed?.graphql ? '✅ OK' :
            status.checksPerformed?.graphql === false ? '❌ Failed' : '⏳ ...'
          }</div>
        </div>
      </div>

      {status.tokenInfo && (
        <div style={{ marginBottom: '10px', padding: '8px', background: '#e8f4f8', borderRadius: '4px' }}>
          <strong>Token Info:</strong>
          <div style={{ fontSize: '10px', marginTop: '4px' }}>
            {status.tokenInfo.error ? (
              <span style={{ color: 'red' }}>{status.tokenInfo.error}</span>
            ) : (
              <>
                <div>Shop: {status.tokenInfo.shop}</div>
                <div>Expires in: {status.tokenInfo.timeUntilExpiry}s</div>
                <div>Status: {status.tokenInfo.isExpired ? '❌ Expired' : '✅ Valid'}</div>
              </>
            )}
          </div>
        </div>
      )}

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