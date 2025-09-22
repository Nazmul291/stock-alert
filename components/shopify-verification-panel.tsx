'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, Text, Badge, Button, BlockStack, InlineStack } from '@shopify/polaris';

export default function ShopifyVerificationPanel() {
  const [checks, setChecks] = useState({
    appBridgeLoaded: false,
    sessionTokenInUrl: false,
    sessionTokenValid: false,
    lastApiCall: null as Date | null,
    apiCallsCount: 0
  });

  const searchParams = useSearchParams();

  useEffect(() => {
    const runChecks = () => {
      const newChecks = {
        // Check if App Bridge is loaded
        appBridgeLoaded: typeof window !== 'undefined' && !!window.shopify,

        // Check if session token is in URL
        sessionTokenInUrl: !!searchParams.get('id_token'),

        sessionTokenValid: false,
        lastApiCall: null as Date | null,
        apiCallsCount: 0
      };

      // Test session token validity
      const sessionToken = searchParams.get('id_token');
      if (sessionToken) {
        fetch('/api/session-check', {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        })
        .then(response => {
          newChecks.sessionTokenValid = response.ok;
          newChecks.lastApiCall = new Date();
          newChecks.apiCallsCount = checks.apiCallsCount + 1;
          setChecks(prev => ({ ...prev, ...newChecks }));
        })
        .catch(() => {
          newChecks.sessionTokenValid = false;
          setChecks(prev => ({ ...prev, ...newChecks }));
        });
      }

      setChecks(prev => ({ ...prev, ...newChecks }));
    };

    runChecks();
    const interval = setInterval(runChecks, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [searchParams, checks.apiCallsCount]);

  const getBadge = (status: boolean) => (
    <Badge tone={status ? 'success' : 'critical'}>
      {status ? 'PASS' : 'FAIL'}
    </Badge>
  );

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingMd" as="h2">
          Shopify Integration Verification
        </Text>

        <BlockStack gap="300">
          <InlineStack gap="200" align="space-between">
            <Text>App Bridge Script Loaded</Text>
            {getBadge(checks.appBridgeLoaded)}
          </InlineStack>

          <InlineStack gap="200" align="space-between">
            <Text>Session Token in URL</Text>
            {getBadge(checks.sessionTokenInUrl)}
          </InlineStack>

          <InlineStack gap="200" align="space-between">
            <Text>Session Token Valid</Text>
            {getBadge(checks.sessionTokenValid)}
          </InlineStack>

          <InlineStack gap="200" align="space-between">
            <Text>API Calls Made</Text>
            <Badge>{checks.apiCallsCount}</Badge>
          </InlineStack>

          {checks.lastApiCall && (
            <Text variant="bodySm" tone="subdued">
              Last API call: {checks.lastApiCall.toLocaleTimeString()}
            </Text>
          )}
        </BlockStack>

        <BlockStack gap="200">
          <Text variant="headingSm" as="h3">What Shopify Checks:</Text>
          <Text variant="bodySm">
            ✅ App Bridge script from https://cdn.shopify.com/shopifycloud/app-bridge.js<br/>
            ✅ Session tokens in Authorization headers<br/>
            ✅ Valid 200/401 responses based on token validity<br/>
            ✅ Regular authenticated API requests
          </Text>
        </BlockStack>

        {checks.appBridgeLoaded && checks.sessionTokenInUrl && checks.sessionTokenValid && (
          <Badge tone="success" size="large">
            🎉 Your app should pass Shopify's embedded app checks!
          </Badge>
        )}
      </BlockStack>
    </Card>
  );
}