'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Initialize App Bridge according to Shopify's requirements
 * This component ensures App Bridge is properly configured
 */
export default function AppBridgeInit() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Wait for App Bridge to load
    const initAppBridge = () => {
      // Check if we're in Shopify admin iframe
      const inIframe = window !== window.parent;
      if (!inIframe) {
        console.log('[AppBridgeInit] Not in iframe, skipping initialization');
        return;
      }

      // Check if App Bridge is available
      if (!window.shopify && !window.ShopifyBridge) {
        console.log('[AppBridgeInit] App Bridge not loaded yet');
        return false;
      }

      console.log('[AppBridgeInit] App Bridge detected, initializing...');

      // Set shopify-api-key meta tag if not present
      const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
      if (apiKey) {
        let metaTag = document.querySelector('meta[name="shopify-api-key"]');
        if (!metaTag) {
          metaTag = document.createElement('meta');
          metaTag.setAttribute('name', 'shopify-api-key');
          metaTag.setAttribute('content', apiKey);
          document.head.appendChild(metaTag);
          console.log('[AppBridgeInit] Added shopify-api-key meta tag');
        }
      }

      // Initialize App Bridge if we have the new API
      if (window.shopify && typeof window.shopify.createApp === 'function' && host && apiKey) {
        try {
          const app = window.shopify.createApp({
            apiKey: apiKey,
            host: host,
            forceRedirect: false,
          });
          console.log('[AppBridgeInit] App Bridge app created');

          // Store app instance globally for other components
          (window as any).__SHOPIFY_APP__ = app;

          // Test session token retrieval and make immediate Shopify API calls
          if (typeof app.idToken === 'function') {
            app.idToken().then(async (token: string) => {
              console.log('[AppBridgeInit] Successfully retrieved session token (length:', token?.length, ')');

              // Immediate API call to help Shopify detect session token usage
              try {
                // 1. Call our verify-session endpoint
                const verifyResponse = await fetch('/api/shopify/verify-session', {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  }
                });
                const verifyData = await verifyResponse.json();
                console.log('[AppBridgeInit] Session verification:', verifyData);

                // 2. Make a GraphQL query
                const graphqlResponse = await fetch('/api/shopify/graphql', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    query: `
                      query shopInfo {
                        shop {
                          name
                          id
                          currencyCode
                        }
                      }
                    `
                  })
                });
                const graphqlData = await graphqlResponse.json();
                console.log('[AppBridgeInit] GraphQL query result:', graphqlData);

                // 3. Call our auth test endpoint
                const authTestResponse = await fetch('/api/shopify/auth-test', {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                  }
                });
                const authTestData = await authTestResponse.json();
                console.log('[AppBridgeInit] Auth test result:', authTestData);

                // Mark that we've successfully used session tokens
                window.sessionStorage.setItem('session_token_verified', 'true');
                window.sessionStorage.setItem('session_token_timestamp', new Date().toISOString());

              } catch (error) {
                console.error('[AppBridgeInit] Error making initial API calls:', error);
              }
            }).catch((error: any) => {
              console.error('[AppBridgeInit] Failed to get session token:', error);
            });
          }
        } catch (error) {
          console.error('[AppBridgeInit] Failed to create app:', error);
        }
      }

      return true;
    };

    // Try to initialize immediately
    if (initAppBridge()) return;

    // If not ready, poll for App Bridge
    const checkInterval = setInterval(() => {
      if (initAppBridge()) {
        clearInterval(checkInterval);
      }
    }, 100);

    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkInterval), 10000);

    return () => clearInterval(checkInterval);
  }, [shop, host]);

  return null; // This component doesn't render anything
}