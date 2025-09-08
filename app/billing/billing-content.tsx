'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

  const handleUpgrade = async () => {
    setUpgrading(true);
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'pro' }),
      });

      const data = await response.json();
      
      if (data.confirmation_url) {
        window.location.href = data.confirmation_url;
      }
    } catch (error) {
      console.error('Upgrade error:', error);
    } finally {
      setUpgrading(false);
    }
  };

  const handleDowngrade = async () => {
    setUpgrading(true);
    try {
      const response = await fetch('/api/billing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: 'free' }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Downgrade error:', error);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <Page
      title="Billing & Plans"
      backAction={{
        content: 'Dashboard',
        url: `/dashboard?shop=${searchParams.shop}&host=${searchParams.host}`,
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
                <h2 style={{ marginBottom: '10px' }}>Free Plan</h2>
                <p style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>$0/month</p>
                
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
                <h2 style={{ marginBottom: '10px' }}>Pro Plan</h2>
                <p style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>$9.99/month</p>
                <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>7-day free trial</p>
                
                <List>
                  <List.Item>Everything in Free, plus:</List.Item>
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