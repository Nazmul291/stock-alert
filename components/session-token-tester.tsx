'use client';

import { useEffect, useState } from 'react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';

/**
 * Component that makes authenticated requests for Shopify to detect
 * This ensures Shopify can see we're using session tokens
 */
export default function SessionTokenTester() {
  const [testResults, setTestResults] = useState<any[]>([]);
  const authenticatedFetch = useAuthenticatedFetch();

  useEffect(() => {
    const runTests = async () => {
      const results = [];

      // Test 1: Call our auth test endpoint
      try {
        const response = await authenticatedFetch('/api/shopify/auth-test');
        const data = await (response as Response).json();
        results.push({
          endpoint: '/api/shopify/auth-test',
          status: (response as Response).status,
          authenticated: data.authenticated,
          timestamp: new Date().toISOString()
        });
        console.log('[SessionTokenTester] Auth test result:', data);
      } catch (error) {
        console.error('[SessionTokenTester] Auth test failed:', error);
      }

      // Test 2: Call session verification endpoint with Shopify API call
      try {
        const response = await authenticatedFetch('/api/shopify/verify-session');
        const data = await (response as Response).json();
        results.push({
          endpoint: '/api/shopify/verify-session',
          status: (response as Response).status,
          authenticated: data.authenticated,
          sessionTokenValid: data.sessionTokenValid,
          timestamp: new Date().toISOString()
        });
        console.log('[SessionTokenTester] Verify session result:', data);
      } catch (error) {
        console.error('[SessionTokenTester] Verify session failed:', error);
      }

      // Test 3: Make a GraphQL query
      try {
        const response = await authenticatedFetch('/api/shopify/graphql', {
          method: 'POST',
          body: JSON.stringify({
            query: `
              query appTest {
                shop {
                  name
                  currencyCode
                }
              }
            `
          })
        });
        const data = await (response as Response).json();
        results.push({
          endpoint: '/api/shopify/graphql',
          status: (response as Response).status,
          hasData: !!data,
          graphql: true,
          timestamp: new Date().toISOString()
        });
        console.log('[SessionTokenTester] GraphQL result:', data);
      } catch (error) {
        console.error('[SessionTokenTester] GraphQL failed:', error);
      }

      // Test 4: Call session check endpoint
      try {
        const response = await authenticatedFetch('/api/session-check');
        const data = await (response as Response).json();
        results.push({
          endpoint: '/api/session-check',
          status: (response as Response).status,
          authenticated: data.authenticated,
          timestamp: new Date().toISOString()
        });
        console.log('[SessionTokenTester] Session check result:', data);
      } catch (error) {
        console.error('[SessionTokenTester] Session check failed:', error);
      }

      // Test 5: Call a data endpoint
      try {
        const shop = new URLSearchParams(window.location.search).get('shop');
        if (shop) {
          const response = await authenticatedFetch(`/api/products/stats?shop=${shop}`);
          const data = await (response as Response).json();
          results.push({
            endpoint: '/api/products/stats',
            status: (response as Response).status,
            hasData: !!data.stats,
            timestamp: new Date().toISOString()
          });
          console.log('[SessionTokenTester] Stats API result:', data);
        }
      } catch (error) {
        console.error('[SessionTokenTester] Stats API failed:', error);
      }

      setTestResults(results);

      // Send results to server for logging
      if (results.length > 0) {
        try {
          await authenticatedFetch('/api/shopify/log-auth', {
            method: 'POST',
            body: JSON.stringify({
              tests: results,
              userAgent: navigator.userAgent,
              timestamp: new Date().toISOString()
            })
          });
        } catch (error) {
          console.error('[SessionTokenTester] Failed to log results:', error);
        }
      }
    };

    // Run tests multiple times initially to ensure Shopify detects
    const timer1 = setTimeout(runTests, 1000);  // After 1 second
    const timer2 = setTimeout(runTests, 3000);  // After 3 seconds
    const timer3 = setTimeout(runTests, 5000);  // After 5 seconds
    const timer4 = setTimeout(runTests, 10000); // After 10 seconds

    // Then run tests periodically to ensure Shopify can detect them
    const interval = setInterval(runTests, 30000); // Every 30 seconds

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearInterval(interval);
    };
  }, [authenticatedFetch]);

  // Invisible component - just runs tests in background
  return (
    <div style={{ display: 'none' }} data-session-token-tester="active">
      {/* Hidden div for Shopify to detect if needed */}
      <script type="application/json" data-auth-tests>
        {JSON.stringify(testResults)}
      </script>
    </div>
  );
}