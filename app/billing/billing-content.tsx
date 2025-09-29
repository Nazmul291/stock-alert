'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';
import {
  Page,
  Layout,
  Card,
  Button,
  Badge,
  Banner,
  List,
} from '@shopify/polaris';

interface BillingContentProps {
  store: any;
  searchParams: { shop?: string; host?: string };
}

export default function BillingContent({
  store,
  searchParams
}: BillingContentProps) {
  const router = useRouter();
  const [upgrading, setUpgrading] = useState(false);
  const authenticatedFetch = useAuthenticatedFetch();

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const bodyData = { plan: 'pro' };

      // Use test route for development
      const response = await authenticatedFetch('/api/billing', {
        method: 'POST',
        body: JSON.stringify(bodyData),
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        alert('Failed to create billing charge: Invalid response from server');
        setUpgrading(false);
        return;
      }
      
      if (data.confirmation_url) {
        // Real charge - redirect to Shopify confirmation
        
        // For embedded apps, we need to redirect the parent window, not the iframe
        if (window.parent && window.parent !== window) {
          window.parent.location.href = data.confirmation_url;
        } else {
          window.location.href = data.confirmation_url;
        }
      } else if (data.upgraded) {
        // This should no longer be used - all upgrades go through Shopify confirmation
        alert('Plan upgraded successfully! Redirecting to dashboard...');
        
        // Redirect to dashboard with success parameter
        const dashboardUrl = `/dashboard?shop=${searchParams.shop}&host=${searchParams.host}&upgraded=true`;
        window.location.href = dashboardUrl;
        return;
      } else if (data.error) {
        alert(`Upgrade failed: ${data.error}`);
        setUpgrading(false);
      }
    } catch (error) {
      alert(`Failed to upgrade: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setUpgrading(false);
    }
  };

  const handleDowngrade = async () => {
    setUpgrading(true);
    try {
      const response = await authenticatedFetch('/api/billing', {
        method: 'POST',
        body: JSON.stringify({ plan: 'free' }),
      }) as Response;

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      // Error handling preserved
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <Page
      title="Billing & Plans"
      backAction={{
        content: 'Dashboard',
        url: `/?shop=${searchParams.shop}&host=${searchParams.host}&embedded=1`,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <h2 style={{ marginBottom: '10px' }}>Current Plan</h2>
              <Badge tone={store?.plan === 'pro' ? 'success' : 'info'}>
                {store?.plan === 'pro' ? 'PRO' : 'FREE'}
              </Badge>
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <Card>
              <div style={{ padding: '20px' }}>
                <h2 style={{ marginBottom: '10px' }}>Basic</h2>
                <p style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>Free</p>
                
                <List>
                  <List.Item>Auto-hide sold out products</List.Item>
                  <List.Item>Low stock alerts via email</List.Item>
                  <List.Item>Global threshold settings</List.Item>
                  <List.Item>Basic inventory tracking</List.Item>
                  <List.Item><strong>Monitor up to 10 products</strong></List.Item>
                </List>

                {store?.plan === 'pro' && (
                  <div style={{ marginTop: '20px' }}>
                    <Button 
                      onClick={handleDowngrade}
                      loading={upgrading}
                      fullWidth
                    >
                      Downgrade to Free
                    </Button>
                  </div>
                )}

                {store?.plan === 'free' && (
                  <div style={{ marginTop: '20px' }}>
                    <Badge tone="info">Current Plan</Badge>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <div style={{ padding: '20px' }}>
                <h2 style={{ marginBottom: '10px' }}>Professional</h2>
                <p style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>$9.99/month</p>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>7-day free trial</p>
                
                <List>
                  <List.Item>Everything in Basic, plus:</List.Item>
                  <List.Item>Slack notifications</List.Item>
                  <List.Item>Per-product thresholds</List.Item>
                  <List.Item>Auto-republish when restocked</List.Item>
                  <List.Item>Advanced rules & collections</List.Item>
                  <List.Item>Multiple notification users</List.Item>
                  <List.Item>Priority support</List.Item>
                  <List.Item><strong>Monitor up to 10,000 products</strong></List.Item>
                </List>

                {store?.plan === 'free' && (
                  <div style={{ marginTop: '20px' }}>
                    <Button 
                      variant="primary"
                      onClick={handleUpgrade}
                      loading={upgrading}
                      fullWidth
                    >
                      Upgrade to Pro
                    </Button>
                  </div>
                )}

                {store?.plan === 'pro' && (
                  <div style={{ marginTop: '20px' }}>
                    <Badge tone="success">Current Plan</Badge>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </Layout.Section>

        {store?.plan === 'free' && (
          <Layout.Section>
            <Banner tone="info">
              <p>
                <strong>Why upgrade to Pro?</strong> Get instant Slack notifications, set custom thresholds for each product, 
                and access advanced features to better manage your inventory. Start with a 7-day free trial!
              </p>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}