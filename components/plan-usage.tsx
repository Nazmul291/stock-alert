'use client';

import { useState, useEffect } from 'react';
import { Card, Text, ProgressBar, Badge, Box, BlockStack, InlineStack, Button } from '@shopify/polaris';
import { useRouter } from 'next/navigation';

interface PlanUsageProps {
  shop: string;
  host?: string;
  plan: string;
  searchParams?: { shop?: string; host?: string };
}

interface UsageData {
  store: {
    plan: string;
    name: string;
    maxProducts: number;
  };
  stats: {
    currentProducts: number;
    maxProducts: number;
    remainingSlots: number;
  };
  validation: {
    canAddProduct: boolean;
    message?: string;
  };
}

export default function PlanUsage({ shop, host, plan, searchParams }: PlanUsageProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false); // Don't show loading initially
  const router = useRouter();

  useEffect(() => {
    async function fetchUsage() {
      setLoading(true); // Only show loading when actively fetching
      try {
        const response = await fetch(`/api/products/validate?shop=${shop}`);
        if (response.ok) {
          const data = await response.json();
          setUsage(data);
        } else {
          // Failed to fetch usage
        }
      } catch (error) {
        // Error fetching usage
      } finally {
        setLoading(false);
      }
    }

    if (shop) {
      fetchUsage();
    }
  }, [shop]);

  const navigateToUpgrade = () => {
    const params = new URLSearchParams();
    if (searchParams?.shop) params.set('shop', searchParams.shop);
    if (searchParams?.host) params.set('host', searchParams.host);
    router.push(`/billing?${params.toString()}`);
  };

  // Show a default state if no data yet (don't show loading on initial render)
  if (!usage) {
    return (
      <Card>
        <Box padding="400">
          <BlockStack gap="200">
            <Text variant="headingMd" as="h3">Plan Usage</Text>
            <Text variant="bodyMd" tone="subdued" as="p">
              {loading ? 'Updating...' : `${plan === 'pro' ? 'Professional' : 'Free'} Plan`}
            </Text>
          </BlockStack>
        </Box>
      </Card>
    );
  }

  const { stats, store } = usage;
  const usagePercentage = Math.round((stats.currentProducts / stats.maxProducts) * 100);
  const isNearLimit = usagePercentage >= 80;
  const isAtLimit = usagePercentage >= 100;

  return (
    <Card>
      <Box padding="400">
        <BlockStack gap="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text variant="headingMd" as="h3">Plan Usage</Text>
            <Badge tone={store.plan === 'pro' ? 'success' : 'info'}>
              {store.name}
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

            {stats.remainingSlots > 0 && (
              <Text variant="bodySm" tone="subdued" as="p">
                {stats.remainingSlots} slots remaining
              </Text>
            )}

            {isAtLimit && store.plan === 'free' && (
              <Box paddingBlockStart="200">
                <BlockStack gap="200">
                  <Text variant="bodySm" tone="critical" as="p">
                    You've reached your 10 product limit on the Free plan.
                  </Text>
                  <Button 
                    variant="primary" 
                    size="slim"
                    onClick={navigateToUpgrade}
                  >
                    Upgrade to Professional
                  </Button>
                </BlockStack>
              </Box>
            )}

            {isNearLimit && !isAtLimit && store.plan === 'free' && (
              <Box paddingBlockStart="200">
                <BlockStack gap="200">
                  <Text variant="bodySm" as="p">
                    You're approaching your 10 product limit. Upgrade to track up to 10,000 products.
                  </Text>
                  <Button 
                    size="slim"
                    onClick={navigateToUpgrade}
                  >
                    Upgrade Now
                  </Button>
                </BlockStack>
              </Box>
            )}
          </BlockStack>
        </BlockStack>
      </Box>
    </Card>
  );
}