'use client';

import { Page, Layout, Card, Banner, Button } from '@shopify/polaris';
import { useEffect } from 'react';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <Page title="Dashboard">
      <Layout>
        <Layout.Section>
          <Banner
            title="Something went wrong!"
            tone="critical"
            action={{
              content: 'Try again',
              onAction: reset,
            }}
          >
            <p>{error.message || 'Failed to load dashboard data'}</p>
          </Banner>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px', textAlign: 'center' }}>
              <h2 style={{ marginBottom: '10px' }}>Unable to load dashboard</h2>
              <p style={{ marginBottom: '20px', color: '#666' }}>
                There was an error loading your dashboard. This might be a temporary issue.
              </p>
              <Button onClick={reset} variant="primary">
                Reload Dashboard
              </Button>
            </div>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}