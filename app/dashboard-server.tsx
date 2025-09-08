// This is a SERVER COMPONENT - No 'use client' directive
// All data is fetched on the server and rendered immediately

import { 
  Page, 
  Layout, 
  Card, 
  Button, 
  Badge, 
  Text, 
  BlockStack,
  InlineGrid,
  Box,
  Icon,
  InlineStack,
  Divider,
  ProgressBar,
  Banner
} from '@shopify/polaris';
import {
  PackageIcon,
  AlertTriangleIcon,
  SettingsIcon,
  CreditCardIcon,
  ChartVerticalIcon,
  NotificationIcon,
  StatusActiveIcon,
  AutomationIcon,
  EmailIcon,
  HashtagIcon
} from '@shopify/polaris-icons';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';

interface DashboardProps {
  searchParams: { shop?: string; host?: string };
  setupProgress?: any;
  store?: any;
}

// Server Component - fetches all data on server
export default async function DashboardServer({ 
  searchParams, 
  setupProgress, 
  store 
}: DashboardProps) {
  
  // Fetch all dashboard data on the server
  let stats = {
    productsTracked: 0,
    lowStockItems: 0,
    hiddenProducts: 0,
    alertsSentToday: 0,
    maxProducts: 10,
    currentProducts: 0
  };

  if (store?.id) {
    try {
      // Fetch inventory tracking stats
      const { count: productCount } = await supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id);

      const { count: lowStockCount } = await supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .lt('current_quantity', 5);

      const { count: hiddenCount } = await supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('is_hidden', true);

      // Get today's alerts
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: alertsToday } = await supabaseAdmin
        .from('alert_history')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .gte('sent_at', today.toISOString());

      stats = {
        productsTracked: productCount || 0,
        lowStockItems: lowStockCount || 0,
        hiddenProducts: hiddenCount || 0,
        alertsSentToday: alertsToday || 0,
        maxProducts: store.plan === 'pro' ? 10000 : 10,
        currentProducts: productCount || 0
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    }
  }

  const progressPercentage = setupProgress ? 
    Math.round(
      [
        setupProgress.app_installed,
        setupProgress.global_settings_configured,
        setupProgress.notifications_configured,
        setupProgress.product_thresholds_configured
      ].filter(Boolean).length / 4 * 100
    ) : 25;

  const usagePercentage = Math.round((stats.currentProducts / stats.maxProducts) * 100);

  // Build URLs with params
  const buildUrl = (path: string) => {
    const params = new URLSearchParams();
    if (searchParams.shop) params.set('shop', searchParams.shop);
    if (searchParams.host) params.set('host', searchParams.host);
    return `${path}?${params.toString()}`;
  };

  return (
    <Page>
      <div className="pb-24">
        <Layout>
          {/* Welcome Section */}
          <Layout.Section>
            <Card>
              <Box padding="600">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="200">
                      <Text variant="heading2xl" as="h1">
                        Welcome to Stock Alert
                      </Text>
                      <Text variant="bodyLg" tone="subdued" as="p">
                        Here&apos;s what&apos;s happening with your inventory today
                      </Text>
                    </BlockStack>
                    <Badge tone="success">
                      <div className="flex items-center gap-1">
                        <span className="inline-flex leading-none">
                          <Icon source={StatusActiveIcon} />
                        </span>
                        <span>System Active</span>
                      </div>
                    </Badge>
                  </InlineStack>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* Stats Overview */}
          <Layout.Section>
            <InlineGrid columns={{xs: 1, sm: 2, md: 4}} gap="400">
              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <div className="flex justify-end items-center gap-2">
                      <span className="mr-auto inline-flex leading-none">
                        <Icon source={PackageIcon} tone="base" />
                      </span>
                      <Badge tone="info">Live</Badge>
                    </div>
                    <Text variant="heading3xl" as="p">
                      {stats.productsTracked}
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Products Tracked
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar progress={usagePercentage} size="small" />
                    </Box>
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <div className="flex justify-end items-center gap-2">
                      <span className="mr-auto inline-flex leading-none">
                        <Icon source={AlertTriangleIcon} tone="warning" />
                      </span>
                      <Badge tone="warning">Alert</Badge>
                    </div>
                    <Text variant="heading3xl" as="p">
                      {stats.lowStockItems}
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Low Stock Items
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar 
                        progress={stats.productsTracked > 0 ? 
                          (stats.lowStockItems / stats.productsTracked) * 100 : 0} 
                        size="small" 
                      />
                    </Box>
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <div className="flex justify-end items-center gap-2">
                      <span className="mr-auto inline-flex leading-none">
                        <Icon source={AutomationIcon} tone="success" />
                      </span>
                      <Badge tone="success">Active</Badge>
                    </div>
                    <Text variant="heading3xl" as="p">
                      {stats.hiddenProducts}
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Hidden Products
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar 
                        progress={stats.productsTracked > 0 ? 
                          (stats.hiddenProducts / stats.productsTracked) * 100 : 0} 
                        size="small" 
                      />
                    </Box>
                  </BlockStack>
                </Box>
              </Card>

              <Card>
                <Box padding="400">
                  <BlockStack gap="200">
                    <div className="flex justify-end items-center gap-2">
                      <span className="mr-auto inline-flex leading-none">
                        <Icon source={NotificationIcon} tone="base" />
                      </span>
                      <Badge>Today</Badge>
                    </div>
                    <Text variant="heading3xl" as="p">
                      {stats.alertsSentToday}
                    </Text>
                    <Text variant="bodyMd" tone="subdued" as="p">
                      Alerts Sent
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar progress={0} size="small" />
                    </Box>
                  </BlockStack>
                </Box>
              </Card>
            </InlineGrid>
          </Layout.Section>

          {/* Plan Usage Section */}
          <Layout.Section>
            <Card>
              <Box padding="400">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h3">Plan Usage</Text>
                    <Badge tone={store?.plan === 'pro' ? 'success' : 'info'}>
                      {store?.plan === 'pro' ? 'Professional' : 'Free'} Plan
                    </Badge>
                  </InlineStack>

                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text variant="bodyMd" as="p">Products Tracked</Text>
                      <Text variant="bodyMd" fontWeight="semibold" as="p">
                        {stats.currentProducts} / {stats.maxProducts}
                      </Text>
                    </InlineStack>
                    
                    <ProgressBar 
                      progress={usagePercentage} 
                      size="small"
                    />

                    {stats.currentProducts < stats.maxProducts && (
                      <Text variant="bodySm" tone="subdued" as="p">
                        {stats.maxProducts - stats.currentProducts} slots remaining
                      </Text>
                    )}

                    {usagePercentage >= 100 && store?.plan === 'free' && (
                      <Box paddingBlockStart="200">
                        <BlockStack gap="200">
                          <Text variant="bodySm" tone="critical" as="p">
                            You&apos;ve reached your 10 product limit on the Free plan.
                          </Text>
                          <Link href={buildUrl('/billing')} passHref>
                            <Button variant="primary" size="slim">
                              Upgrade to Professional
                            </Button>
                          </Link>
                        </BlockStack>
                      </Box>
                    )}
                  </BlockStack>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* Quick Actions */}
          <Layout.Section>
            <Card>
              <Box padding="600">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">
                      Quick Actions
                    </Text>
                  </InlineStack>
                  
                  <InlineGrid columns={{xs: 1, sm: 2}} gap="400">
                    <Box>
                      <Link href={buildUrl('/settings')} passHref>
                        <Button fullWidth size="large" icon={SettingsIcon}>
                          Settings
                        </Button>
                      </Link>
                    </Box>
                    <Box>
                      <Link href={buildUrl('/billing')} passHref>
                        <Button fullWidth size="large" icon={CreditCardIcon}>
                          Billing
                        </Button>
                      </Link>
                    </Box>
                  </InlineGrid>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* Setup Progress */}
          {setupProgress && (
            <Layout.Section>
              <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="h3">
                      Setup Progress
                    </Text>
                    
                    <Box>
                      <InlineStack align="space-between" blockAlign="center">
                        <Text variant="bodyMd" as="p">Overall Progress</Text>
                        <Text variant="bodyMd" fontWeight="semibold" as="p">
                          {progressPercentage}%
                        </Text>
                      </InlineStack>
                      <Box paddingBlockStart="200">
                        <ProgressBar progress={progressPercentage} />
                      </Box>
                    </Box>

                    <BlockStack gap="300">
                      <div className="flex items-center gap-2">
                        <Badge tone="success" size="small">✓</Badge>
                        <Text variant="bodySm" as="p">App installed successfully</Text>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge 
                          tone={setupProgress.global_settings_configured ? "success" : undefined} 
                          size="small"
                        >
                          {setupProgress.global_settings_configured ? '✓' : '○'}
                        </Badge>
                        <Text 
                          variant="bodySm" 
                          tone={setupProgress.global_settings_configured ? undefined : "subdued"}
                          as="p"
                        >
                          Configure global settings
                        </Text>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge 
                          tone={setupProgress.notifications_configured ? "success" : undefined} 
                          size="small"
                        >
                          {setupProgress.notifications_configured ? '✓' : '○'}
                        </Badge>
                        <Text 
                          variant="bodySm" 
                          tone={setupProgress.notifications_configured ? undefined : "subdued"}
                          as="p"
                        >
                          Set up notifications
                        </Text>
                      </div>
                    </BlockStack>

                    {progressPercentage < 100 && (
                      <Box paddingBlockStart="200">
                        <Link href={buildUrl('/settings')} passHref>
                          <Button fullWidth>Complete Setup</Button>
                        </Link>
                      </Box>
                    )}
                  </BlockStack>
                </Box>
              </Card>
            </Layout.Section>
          )}
        </Layout>
      </div>
    </Page>
  );
}