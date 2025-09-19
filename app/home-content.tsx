'use client';

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
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import PlanUsage from '@/components/plan-usage';

interface HomeContentProps {
  searchParams: { shop?: string; host?: string };
  setupProgress?: any;
  store?: any;
}

export default function HomeContent({ searchParams, setupProgress, store }: HomeContentProps) {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const navigateTo = (path: string) => {
    const params = new URLSearchParams();
    if (searchParams.shop) params.set('shop', searchParams.shop);
    if (searchParams.host) params.set('host', searchParams.host);
    router.push(`${path}?${params.toString()}`);
  };

  const greeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  // Calculate setup progress percentage - only 3 steps now
  const calculateProgress = () => {
    if (!setupProgress) return 33; // Default if no data (app installed = 33%)

    const steps = [
      setupProgress.app_installed,
      setupProgress.global_settings_configured,
      setupProgress.notifications_configured
    ];

    const completedSteps = steps.filter(step => step).length;
    return Math.round((completedSteps / steps.length) * 100);
  };

  const progressPercentage = calculateProgress();

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
                        {greeting()}, welcome back!
                      </Text>
                      <Text variant="bodyLg" tone="subdued">
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
                      0
                    </Text>
                    <Text variant="bodyMd" tone="subdued">
                      Products Tracked
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar progress={0} size="small" />
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
                      0
                    </Text>
                    <Text variant="bodyMd" tone="subdued">
                      Low Stock Items
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar progress={0} size="small" tone="warning" />
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
                      0
                    </Text>
                    <Text variant="bodyMd" tone="subdued">
                      Hidden Products
                    </Text>
                    <Box paddingBlockStart="200">
                      <ProgressBar progress={0} size="small" tone="success" />
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
                      0
                    </Text>
                    <Text variant="bodyMd" tone="subdued">
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

          {/* Quick Actions */}
          <Layout.Section>
            <Card>
              <Box padding="600">
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingLg" as="h2">
                      Quick Actions
                    </Text>
                    <Text variant="bodySm" tone="subdued">
                      Manage your inventory settings
                    </Text>
                  </InlineStack>
                  
                  <InlineGrid columns={{xs: 1, sm: 2}} gap="400">
                    <Box>
                      <Button 
                        fullWidth 
                        size="large"
                        icon={SettingsIcon}
                        onClick={() => navigateTo('/settings')}
                      >
                        Settings
                      </Button>
                    </Box>
                    <Box>
                      <Button 
                        fullWidth 
                        size="large"
                        icon={CreditCardIcon}
                        onClick={() => navigateTo('/billing')}
                      >
                        Billing
                      </Button>
                    </Box>
                  </InlineGrid>
                </BlockStack>
              </Box>
            </Card>
          </Layout.Section>

          {/* Plan Usage Section */}
          {searchParams.shop && (
            <Layout.Section>
              <PlanUsage 
                shop={searchParams.shop} 
                host={searchParams.host}
                plan={store?.plan || 'free'}
                searchParams={searchParams}
              />
            </Layout.Section>
          )}

          {/* Features Grid */}
          <Layout.Section>
            <InlineGrid columns={{xs: 1, md: 2}} gap="400">
              {/* Active Features */}
              <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex leading-none">
                        <Icon source={StatusActiveIcon} tone="success" />
                      </span>
                      <Text variant="headingMd" as="h3">
                        Active Features
                      </Text>
                    </div>
                    
                    <BlockStack gap="300">
                      <div className="flex gap-2.5">
                        <span className="inline-flex leading-none flex-shrink-0">
                          <Icon source={AutomationIcon} tone="success" />
                        </span>
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold">
                            Auto-Hide Sold Out
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Automatically hide products when inventory reaches zero
                          </Text>
                        </BlockStack>
                      </div>

                      <Divider />

                      <div className="flex gap-2.5">
                        <span className="inline-flex leading-none flex-shrink-0">
                          <Icon source={EmailIcon} tone="success" />
                        </span>
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold">
                            Email Notifications
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Get instant alerts when stock is running low
                          </Text>
                        </BlockStack>
                      </div>

                      <Divider />

                      <div className="flex gap-2.5">
                        <span className="inline-flex leading-none flex-shrink-0">
                          <Icon source={ChartVerticalIcon} tone="success" />
                        </span>
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold">
                            Real-time Tracking
                          </Text>
                          <Text variant="bodySm" tone="subdued">
                            Monitor inventory levels across all products
                          </Text>
                        </BlockStack>
                      </div>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>

              {/* Setup Progress */}
              <Card>
                <Box padding="600">
                  <BlockStack gap="400">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex leading-none">
                        <Icon source={SettingsIcon} />
                      </span>
                      <Text variant="headingMd" as="h3">
                        Setup Progress
                      </Text>
                    </div>
                    
                    <BlockStack gap="400">
                      <Box>
                        <InlineStack align="space-between" blockAlign="center">
                          <Text variant="bodyMd">Overall Progress</Text>
                          <Text variant="bodyMd" fontWeight="semibold">{progressPercentage}%</Text>
                        </InlineStack>
                        <Box paddingBlockStart="200">
                          <ProgressBar progress={progressPercentage} />
                        </Box>
                      </Box>

                      <BlockStack gap="300">
                        <div className="flex items-center gap-2">
                          <Badge tone="success" size="small">✓</Badge>
                          <Text variant="bodySm">App installed successfully</Text>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge tone={setupProgress?.global_settings_configured ? "success" : undefined} size="small">
                            {setupProgress?.global_settings_configured ? '✓' : '○'}
                          </Badge>
                          <Text variant="bodySm" tone={setupProgress?.global_settings_configured ? undefined : "subdued"}>
                            Configure global settings
                          </Text>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge tone={setupProgress?.notifications_configured ? "success" : undefined} size="small">
                            {setupProgress?.notifications_configured ? '✓' : '○'}
                          </Badge>
                          <Text variant="bodySm" tone={setupProgress?.notifications_configured ? undefined : "subdued"}>
                            Set up notifications
                          </Text>
                        </div>
                      </BlockStack>

                      <Box paddingBlockStart="200">
                        <Button fullWidth onClick={() => navigateTo('/settings')}>
                          Complete Setup
                        </Button>
                      </Box>
                    </BlockStack>
                  </BlockStack>
                </Box>
              </Card>
            </InlineGrid>
          </Layout.Section>

          {/* Pro Features Banner */}
          <Layout.Section>
            <Banner
              title="Unlock Pro Features"
              tone="info"
              action={{
                content: 'Upgrade Now',
                onAction: () => navigateTo('/billing'),
              }}
              secondaryAction={{
                content: 'Learn More',
                onAction: () => navigateTo('/billing'),
              }}
            >
              <BlockStack gap="200">
                <Text variant="bodyMd">
                  Get access to advanced features with Stock Alert Pro:
                </Text>
                <InlineGrid columns={{xs: 1, sm: 2}} gap="200">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex leading-none">
                      <Icon source={HashtagIcon} />
                    </span>
                    <Text variant="bodySm">Slack notifications</Text>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex leading-none">
                      <Icon source={PackageIcon} />
                    </span>
                    <Text variant="bodySm">Per-product thresholds</Text>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex leading-none">
                      <Icon source={AutomationIcon} />
                    </span>
                    <Text variant="bodySm">Auto-republish</Text>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex leading-none">
                      <Icon source={ChartVerticalIcon} />
                    </span>
                    <Text variant="bodySm">Advanced analytics</Text>
                  </div>
                </InlineGrid>
              </BlockStack>
            </Banner>
          </Layout.Section>
        </Layout>
        </div>
      </Page>
  );
}