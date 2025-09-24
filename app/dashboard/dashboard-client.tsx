'use client';

import { useState, useEffect } from 'react';
import { 
  Page, 
  Layout, 
  Card, 
  Text, 
  Box,
  InlineGrid,
  BlockStack,
  Badge,
  ProgressBar,
  List,
  Button,
  EmptyState,
  Icon,
  Banner
} from '@shopify/polaris';
import {
  ProductIcon,
  AlertTriangleIcon,
  HideIcon,
  EmailIcon,
  CalendarIcon,
  CheckIcon,
  XIcon
} from '@shopify/polaris-icons';
import { format } from 'date-fns';
import { SessionTokenTest } from '@/components/session-token-test';

interface DashboardClientProps {
  store: any;
  stats: {
    totalProducts: number;
    lowStock: number;
    outOfStock: number;
    hidden: number;
    alertsToday: number;
  };
  setupProgress: any;
  settings: any;
  recentAlerts: any[];
  searchParams: any;
}

export default function DashboardClient({
  store,
  stats,
  setupProgress,
  settings,
  recentAlerts,
  searchParams
}: DashboardClientProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);

  useEffect(() => {
    // Check if we just upgraded
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.get('upgraded') === 'true') {
      setShowUpgradeBanner(true);
      // Remove the upgraded param from URL
      urlParams.delete('upgraded');
      const newUrl = `${window.location.pathname}?${urlParams.toString()}`;
      window.history.replaceState({}, '', newUrl);
      
      // Hide banner after 5 seconds
      setTimeout(() => setShowUpgradeBanner(false), 5000);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    window.location.reload();
  };

  const calculateSetupProgress = () => {
    if (!setupProgress) return 0;
    const steps = [
      setupProgress.app_installed,
      setupProgress.global_settings_configured,
      setupProgress.notifications_configured
    ];
    return (steps.filter(Boolean).length / steps.length) * 100;
  };

  const progressPercentage = calculateSetupProgress();

  return (
    <Page
      title="Dashboard"
      subtitle="Monitor your inventory and alerts"
      primaryAction={{
        content: 'Refresh',
        loading: refreshing,
        onAction: handleRefresh
      }}
      secondaryActions={[
        {
          content: 'View Products',
          url: `/products?${new URLSearchParams(searchParams).toString()}`
        },
        {
          content: 'Settings',
          url: `/settings?${new URLSearchParams(searchParams).toString()}`
        }
      ]}
    >
      {showUpgradeBanner && (
        <div style={{ marginBottom: '16px' }}>
          <Banner
            title="Plan upgraded successfully!"
            tone="success"
            onDismiss={() => setShowUpgradeBanner(false)}
          >
            You have been upgraded to the Professional plan. All pro features are now available.
          </Banner>
        </div>
      )}
      <Layout>
        {/* Welcome Banner for new users */}
        {progressPercentage < 100 && (
          <Layout.Section>
            <Banner
              title="Welcome to Stock Alert!"
              status="info"
              onDismiss={() => {}}
            >
              <p>Complete the setup to start monitoring your inventory automatically.</p>
            </Banner>
          </Layout.Section>
        )}

        {/* Setup Progress */}
        {progressPercentage < 100 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Setup Progress</Text>
                <ProgressBar progress={progressPercentage} />
                <List type="bullet">
                  <List.Item>
                    {setupProgress?.app_installed ? (
                      <Text as="span" tone="success">✓ App Installed</Text>
                    ) : (
                      <Text as="span">App Installed</Text>
                    )}
                  </List.Item>
                  <List.Item>
                    {setupProgress?.global_settings_configured ? (
                      <Text as="span" tone="success">✓ Global Settings Configured</Text>
                    ) : (
                      <Text as="span">Configure Global Settings</Text>
                    )}
                  </List.Item>
                  <List.Item>
                    {setupProgress?.notifications_configured ? (
                      <Text as="span" tone="success">✓ Notifications Set Up</Text>
                    ) : (
                      <Text as="span">Set Up Notifications</Text>
                    )}
                  </List.Item>
                </List>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        {/* Inventory Stats */}
        <Layout.Section>
          <Text variant="headingLg" as="h2">Inventory Overview</Text>
          <div style={{ marginTop: '1rem' }}>
            <InlineGrid columns={{ xs: 1, sm: 2, md: 3, lg: 5 }} gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Icon source={ProductIcon} tone="base" />
                    <Text variant="headingXl" as="h3">{stats.totalProducts}</Text>
                    <Text variant="bodyMd" tone="subdued">Total Products</Text>
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Icon source={AlertTriangleIcon} tone="warning" />
                    <Text variant="headingXl" as="h3">{stats.lowStock}</Text>
                    <Text variant="bodyMd" tone="subdued">Low Stock</Text>
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Icon source={XIcon} tone="critical" />
                    <Text variant="headingXl" as="h3">{stats.outOfStock}</Text>
                    <Text variant="bodyMd" tone="subdued">Out of Stock</Text>
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Icon source={HideIcon} tone="base" />
                    <Text variant="headingXl" as="h3">{stats.hidden}</Text>
                    <Text variant="bodyMd" tone="subdued">Hidden</Text>
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <Icon source={EmailIcon} tone="success" />
                    <Text variant="headingXl" as="h3">{stats.alertsToday}</Text>
                    <Text variant="bodyMd" tone="subdued">Alerts Today</Text>
                  </BlockStack>
                </Box>
              </Card>
            </InlineGrid>
          </div>
        </Layout.Section>

        {/* Recent Alerts */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Recent Alerts</Text>
              {recentAlerts && recentAlerts.length > 0 ? (
                <BlockStack gap="300">
                  {recentAlerts.map((alert, index) => (
                    <Box 
                      key={alert.id || index} 
                      padding="300" 
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <InlineGrid columns={['twoThirds', 'oneThird']} gap="400">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold">
                            {alert.product_title || 'Unknown Product'}
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            {alert.alert_type === 'low_stock' && 'Low Stock Alert'}
                            {alert.alert_type === 'out_of_stock' && 'Out of Stock Alert'}
                            {alert.alert_type === 'restock' && 'Restocked'}
                          </Text>
                        </BlockStack>
                        <Box>
                          <Badge 
                            tone={
                              alert.alert_type === 'out_of_stock' ? 'critical' :
                              alert.alert_type === 'low_stock' ? 'warning' : 
                              'success'
                            }
                          >
                            {alert.sent_at ? format(new Date(alert.sent_at), 'MMM d, h:mm a') : 'Unknown time'}
                          </Badge>
                        </Box>
                      </InlineGrid>
                    </Box>
                  ))}
                </BlockStack>
              ) : (
                <EmptyState
                  heading="No recent alerts"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Alerts will appear here when inventory thresholds are triggered.</p>
                </EmptyState>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Quick Actions */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Quick Actions</Text>
              <InlineGrid columns={{ xs: 1, sm: 2, md: 3 }} gap="400">
                <Button 
                  fullWidth 
                  url={`/products?${new URLSearchParams(searchParams).toString()}`}
                >
                  Manage Products
                </Button>
                <Button 
                  fullWidth 
                  url={`/settings?${new URLSearchParams(searchParams).toString()}`}
                >
                  Configure Settings
                </Button>
                <Button 
                  fullWidth 
                  url={`/billing?${new URLSearchParams(searchParams).toString()}`}
                >
                  View Billing
                </Button>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Session Token Test - Shows for all environments to help Shopify checks */}
        <Layout.Section>
          <SessionTokenTest />
        </Layout.Section>

        {/* Store Info */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Store Information</Text>
              <BlockStack gap="200">
                <InlineGrid columns={2} gap="400">
                  <Box>
                    <Text variant="bodySm" tone="subdued">Store</Text>
                    <Text variant="bodyMd">{store.shop_domain}</Text>
                  </Box>
                  <Box>
                    <Text variant="bodySm" tone="subdued">Plan</Text>
                    <Badge tone={store.plan === 'pro' ? 'success' : 'info'}>
                      {store.plan === 'pro' ? 'Professional' : 'Free'}
                    </Badge>
                  </Box>
                  <Box>
                    <Text variant="bodySm" tone="subdued">Email</Text>
                    <Text variant="bodyMd">{settings?.notification_email || store.email || 'Not set'}</Text>
                  </Box>
                  <Box>
                    <Text variant="bodySm" tone="subdued">Installed</Text>
                    <Text variant="bodyMd">
                      {store.created_at ? format(new Date(store.created_at), 'MMM d, yyyy') : 'Unknown'}
                    </Text>
                  </Box>
                </InlineGrid>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}