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

    // Initialize App Bridge using Shopify's CDN best practices
    const initAppBridge = async () => {
      // Check if App Bridge CDN is loaded
      if (!window.shopify) {
        return false;
      }

      try {
        // Wait for App Bridge to be ready (this is the correct CDN API)
        await window.shopify.ready;

        // Set shopify-api-key meta tag if not present
        const apiKey = process.env.NEXT_PUBLIC_SHOPIFY_API_KEY;
        if (apiKey) {
          let metaTag = document.querySelector('meta[name="shopify-api-key"]');
          if (!metaTag) {
            metaTag = document.createElement('meta');
            metaTag.setAttribute('name', 'shopify-api-key');
            metaTag.setAttribute('content', apiKey);
            document.head.appendChild(metaTag);
          }
        }

        // Use the current page URL to get host parameter
        const urlParams = new URLSearchParams(window.location.search);
        const hostParam = host || urlParams.get('host');

        if (!hostParam) {
          console.warn('[AppBridgeInit] No host parameter found in URL');
          // For development/testing, create a minimal App Bridge instance
          (window as any).__SHOPIFY_APP__ = {
            ready: true,
            idToken: async () => {
              console.warn('[AppBridge] No host parameter - cannot get real session token');
              throw new Error('No host parameter available for session token');
            }
          };
          return true;
        }

        // Store the ready state globally for components to check
        (window as any).__SHOPIFY_APP__ = {
          ready: true,
          host: hostParam,
          apiKey: apiKey,
          // Add methods that components expect
          idToken: async () => {
            // For CDN version, use the shopify.modal or other APIs to get session token
            try {
              if (window.shopify && window.shopify.idToken) {
                return await window.shopify.idToken();
              }
              throw new Error('Session token not available');
            } catch (error) {
              console.error('[AppBridge] Failed to get session token:', error);
              throw error;
            }
          }
        };

        // Test immediate API calls to demonstrate session token usage
        await testSessionTokenUsage();

        return true;
      } catch (error) {
        console.error('[AppBridgeInit] App Bridge initialization failed:', error);
        return false;
      }
    };

    const testSessionTokenUsage = async () => {
      try {
        const appInstance = (window as any).__SHOPIFY_APP__;
        if (appInstance && appInstance.idToken) {
          const token = await appInstance.idToken();

          // Test our auth endpoints
          const authTestResponse = await fetch('/api/shopify/auth-test', {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const authTestData = await authTestResponse.json();

          // Mark successful session token usage
          window.sessionStorage.setItem('session_token_verified', 'true');
          window.sessionStorage.setItem('session_token_timestamp', new Date().toISOString());
        }
      } catch (error) {
        console.warn('[AppBridgeInit] Session token testing failed:', error);
      }
    };

    // Try to initialize immediately
    initAppBridge().then(() => {
      // Initialization completed
    }).catch(() => {
      // If not ready, poll for App Bridge
      const checkInterval = setInterval(async () => {
        const success = await initAppBridge();
        if (success) {
          clearInterval(checkInterval);
        }
      }, 500); // Check every 500ms

      // Stop checking after 10 seconds
      setTimeout(() => clearInterval(checkInterval), 10000);
    });
  }, [shop, host]);

  return null; // This component doesn't render anything
}