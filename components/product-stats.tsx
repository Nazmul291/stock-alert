'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Spinner,
  Icon,
} from '@shopify/polaris';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ViewIcon,
  HideIcon,
} from '@shopify/polaris-icons';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';

interface ProductStatsProps {
  shop: string;
}

interface Stats {
  totalProducts: number;
  outOfStock: number;
  lowStock: number;
  inStock: number;
  hidden: number;
  active: number;
  plan: string;
  threshold: number;
}

interface Percentages {
  outOfStock: number;
  lowStock: number;
  inStock: number;
  hidden: number;
  active: number;
}

export default function ProductStats({ shop }: ProductStatsProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [percentages, setPercentages] = useState<Percentages | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authenticatedFetch = useAuthenticatedFetch();

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [shop]);

  const fetchStats = async () => {
    try {
      const response = await authenticatedFetch(`/api/products/stats?shop=${shop}`) as Response;

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401) {
          // Session expired - the authenticatedFetch will handle redirect
          console.log('Session expired, waiting for redirect...');
          return;
        } else if (response.status === 403) {
          setError('Permission denied. Please reinstall the app.');
        } else {
          setError('Failed to load statistics');
        }
        return;
      }

      const data = await response.json();
      setStats(data.stats);
      setPercentages(data.percentages);
      setError(null);
    } catch (err) {
      // Network error or fetch was aborted (redirect in progress)
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        console.log('Request aborted, likely due to redirect');
        return;
      }
      setError('Failed to load statistics');
      console.error('Error fetching stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <Spinner accessibilityLabel="Loading statistics" size="large" />
        </div>
      </Card>
    );
  }

  if (error || !stats) {
    return (
      <Card>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <Text as="p" tone="critical">{error || 'No statistics available'}</Text>
        </div>
      </Card>
    );
  }

  const StatCard = ({
    title,
    value,
    percentage,
    tone,
    icon
  }: {
    title: string;
    value: number;
    percentage?: number;
    tone?: 'success' | 'warning' | 'critical' | 'info';
    icon?: any;
  }) => (
    <div style={{
      padding: '16px',
      border: '1px solid #e1e3e5',
      borderRadius: '12px',
      backgroundColor: '#fff',
      height: '100%'
    }}>
      <BlockStack gap="300">
        <InlineStack gap="200" align="space-between">
          {icon && (
            <div style={{ color: tone === 'success' ? '#008060' : tone === 'warning' ? '#b98900' : tone === 'critical' ? '#d72c0d' : '#5c6ac4' }}>
              <Icon source={icon} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <Text as="p" variant="bodySm" tone="subdued">{title}</Text>
          </div>
        </InlineStack>

        <InlineStack gap="200" align="start" blockAlign="baseline">
          <Text as="p" variant="heading2xl" fontWeight="bold">
            {value.toLocaleString()}
          </Text>
          {percentage !== undefined && (
            <Badge tone={tone || 'info'}>
              {`${percentage}%`}
            </Badge>
          )}
        </InlineStack>
      </BlockStack>
    </div>
  );

  return (
    <BlockStack gap="400">
      {/* Overview Card */}
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Inventory Overview
          </Text>

          <InlineStack gap="300" align="space-between">
            <div style={{ flex: 1 }}>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Total Products</Text>
                <Text as="p" variant="heading3xl" fontWeight="bold">
                  {stats.totalProducts.toLocaleString()}
                </Text>
              </BlockStack>
            </div>

            <div style={{ flex: 1 }}>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Plan</Text>
                <Badge tone={stats.plan === 'pro' ? 'success' : 'info'}>
                  {stats.plan === 'pro' ? 'Professional' : 'Free'}
                </Badge>
              </BlockStack>
            </div>

            <div style={{ flex: 1 }}>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">Low Stock Threshold</Text>
                <Text as="p" variant="headingLg" fontWeight="semibold">
                  ≤ {stats.threshold} units
                </Text>
              </BlockStack>
            </div>
          </InlineStack>
        </BlockStack>
      </Card>

      {/* Stock Status Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <StatCard
          title="Out of Stock"
          value={stats.outOfStock}
          percentage={percentages?.outOfStock}
          tone="critical"
          icon={AlertCircleIcon}
        />

        <StatCard
          title="Low Stock"
          value={stats.lowStock}
          percentage={percentages?.lowStock}
          tone="warning"
          icon={AlertTriangleIcon}
        />

        <StatCard
          title="In Stock"
          value={stats.inStock}
          percentage={percentages?.inStock}
          tone="success"
          icon={CheckCircleIcon}
        />
      </div>

      {/* Visibility Status */}
      <Card>
        <BlockStack gap="400">
          <Text as="h3" variant="headingMd">
            Product Visibility
          </Text>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{
              padding: '16px',
              border: '1px solid #e1e3e5',
              borderRadius: '8px',
              backgroundColor: '#f7f7f7'
            }}>
              <InlineStack gap="300" align="space-between">
                <InlineStack gap="200">
                  <Icon source={ViewIcon} />
                  <Text as="p" fontWeight="medium">Active Products</Text>
                </InlineStack>
                <Badge tone="success">{String(stats.active)}</Badge>
              </InlineStack>
            </div>

            <div style={{
              padding: '16px',
              border: '1px solid #e1e3e5',
              borderRadius: '8px',
              backgroundColor: '#f7f7f7'
            }}>
              <InlineStack gap="300" align="space-between">
                <InlineStack gap="200">
                  <Icon source={HideIcon} />
                  <Text as="p" fontWeight="medium">Hidden Products</Text>
                </InlineStack>
                <Badge>{String(stats.hidden)}</Badge>
              </InlineStack>
            </div>
          </div>
        </BlockStack>
      </Card>

      {/* Stock Level Distribution */}
      {stats.totalProducts > 0 && (
        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">
              Stock Distribution
            </Text>

            <BlockStack gap="300">
              <BlockStack gap="100">
                <InlineStack gap="200" align="space-between">
                  <Text as="p" variant="bodySm">Out of Stock</Text>
                  <Text as="p" variant="bodySm" fontWeight="medium">
                    {percentages?.outOfStock || 0}% ({stats.outOfStock} products)
                  </Text>
                </InlineStack>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#f1f1f1',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.max(percentages?.outOfStock || 0, 0.5)}%`,
                    height: '100%',
                    backgroundColor: '#d72c0d',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </BlockStack>

              <BlockStack gap="100">
                <InlineStack gap="200" align="space-between">
                  <Text as="p" variant="bodySm">Low Stock</Text>
                  <Text as="p" variant="bodySm" fontWeight="medium">
                    {percentages?.lowStock || 0}% ({stats.lowStock} products)
                  </Text>
                </InlineStack>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#f1f1f1',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.max(percentages?.lowStock || 0, 0.5)}%`,
                    height: '100%',
                    backgroundColor: '#b98900',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </BlockStack>

              <BlockStack gap="100">
                <InlineStack gap="200" align="space-between">
                  <Text as="p" variant="bodySm">In Stock</Text>
                  <Text as="p" variant="bodySm" fontWeight="medium">
                    {percentages?.inStock || 0}% ({stats.inStock} products)
                  </Text>
                </InlineStack>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#f1f1f1',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.max(percentages?.inStock || 0, 0.5)}%`,
                    height: '100%',
                    backgroundColor: '#008060',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </BlockStack>
            </BlockStack>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}