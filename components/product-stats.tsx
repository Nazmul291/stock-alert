'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  Layout,
  Text,
  Badge,
  InlineStack,
  BlockStack,
  Spinner,
  Icon,
  ProgressBar,
  Box,
} from '@shopify/polaris';
import {
  PackageIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ViewIcon,
  HideIcon,
} from '@shopify/polaris-icons';

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

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [shop]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/products/stats?shop=${shop}`);
      if (!response.ok) throw new Error('Failed to fetch stats');

      const data = await response.json();
      setStats(data.stats);
      setPercentages(data.percentages);
      setError(null);
    } catch (err) {
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
              {percentage}%
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
                <Badge tone="success">{stats.active}</Badge>
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
                <Badge>{stats.hidden}</Badge>
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
                    {percentages?.outOfStock}% ({stats.outOfStock} products)
                  </Text>
                </InlineStack>
                {percentages?.outOfStock === 0 ? (
                  <div style={{
                    height: '4px',
                    backgroundColor: '#f1f1f1',
                    borderRadius: '2px',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: '2px',
                      backgroundColor: '#d72c0d',
                      borderRadius: '2px'
                    }} />
                  </div>
                ) : (
                  <ProgressBar progress={percentages.outOfStock} tone="critical" size="small" />
                )}
              </BlockStack>

              <BlockStack gap="100">
                <InlineStack gap="200" align="space-between">
                  <Text as="p" variant="bodySm">Low Stock</Text>
                  <Text as="p" variant="bodySm" fontWeight="medium">
                    {percentages?.lowStock}% ({stats.lowStock} products)
                  </Text>
                </InlineStack>
                {percentages?.lowStock === 0 ? (
                  <div style={{
                    height: '4px',
                    backgroundColor: '#f1f1f1',
                    borderRadius: '2px',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: '2px',
                      backgroundColor: '#b98900',
                      borderRadius: '2px'
                    }} />
                  </div>
                ) : (
                  <ProgressBar progress={percentages.lowStock} tone="warning" size="small" />
                )}
              </BlockStack>

              <BlockStack gap="100">
                <InlineStack gap="200" align="space-between">
                  <Text as="p" variant="bodySm">In Stock</Text>
                  <Text as="p" variant="bodySm" fontWeight="medium">
                    {percentages?.inStock}% ({stats.inStock} products)
                  </Text>
                </InlineStack>
                {percentages?.inStock === 0 ? (
                  <div style={{
                    height: '4px',
                    backgroundColor: '#f1f1f1',
                    borderRadius: '2px',
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: '2px',
                      backgroundColor: '#008060',
                      borderRadius: '2px'
                    }} />
                  </div>
                ) : (
                  <ProgressBar progress={percentages.inStock} tone="success" size="small" />
                )}
              </BlockStack>
            </BlockStack>
          </BlockStack>
        </Card>
      )}
    </BlockStack>
  );
}