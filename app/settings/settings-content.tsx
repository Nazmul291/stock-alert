'use client';

import { Page, Layout, Card, Banner, Text, ProgressBar } from '@shopify/polaris';
import SettingsForm from './settings-form';
import ProductsTable from '../products/products-table';
import SyncProductsButton from './sync-products-button';
import { PLAN_LIMITS } from '@/lib/plan-limits';

interface SettingsContentProps {
  store: any;
  settings: {
    auto_hide_enabled: boolean;
    auto_republish_enabled: boolean;
    low_stock_threshold: number;
    email_notifications: boolean;
    slack_notifications: boolean;
    slack_webhook_url: string;
    notification_email: string;
  };
  products: any[];
  searchParams: { shop?: string; host?: string; billing?: string };
}

export default function SettingsContent({ 
  store, 
  settings,
  products,
  searchParams 
}: SettingsContentProps) {
  // Calculate current product usage
  const plan = store?.plan || 'free';
  const planLimits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
  const maxProducts = planLimits.maxProducts;
  
  // Count distinct products (not variants)
  const distinctProductIds = new Set(products.map(p => p.product_id));
  const currentProducts = distinctProductIds.size;
  const usagePercentage = (currentProducts / maxProducts) * 100;
  return (
    <Page
      title="Settings"
      backAction={{
        content: 'Home',
        url: `/?shop=${searchParams.shop}&host=${searchParams.host}`,
      }}
    >
      <Layout>
        {searchParams.billing === 'success' && (
          <Layout.Section>
            <Banner
              title="Billing updated successfully"
              tone="success"
            />
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <h2 style={{ marginBottom: '20px' }}>Global Settings</h2>
              <SettingsForm 
                settings={settings}
                plan={store?.plan || 'free'}
                shop={searchParams.shop || ''}
              />
            </div>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0 }}>Product Threshold Settings</h2>
                <SyncProductsButton shop={searchParams.shop || ''} />
              </div>
              
              {/* Product Quota Display */}
              <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <Text variant="bodyMd" fontWeight="semibold">Product Usage</Text>
                  <Text variant="bodySm" tone="subdued">
                    {currentProducts}/{maxProducts} products ({plan.toUpperCase()} plan)
                  </Text>
                </div>
                <ProgressBar 
                  progress={usagePercentage} 
                  tone={usagePercentage >= 90 ? 'critical' : usagePercentage >= 70 ? 'warning' : 'success'}
                />
                {usagePercentage >= 90 && (
                  <Text variant="bodySm" tone="critical" as="p" style={{ marginTop: '8px' }}>
                    You're approaching your product limit. Consider upgrading to Pro for unlimited products.
                  </Text>
                )}
              </div>
              
              <p style={{ marginBottom: '15px', color: '#6b7280' }}>
                Configure custom thresholds and settings for individual products. These settings override the global settings above.
              </p>
              {products.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                  <p style={{ marginBottom: '10px' }}>No products found in your inventory.</p>
                  <p style={{ fontSize: '14px' }}>Click "Sync Products from Shopify" above to import your products.</p>
                </div>
              ) : (
                <ProductsTable products={products} shop={searchParams.shop || ''} />
              )}
            </div>
          </Card>
        </Layout.Section>

        {store?.plan === 'free' && (
          <Layout.Section>
            <Banner tone="info">
              <p>
                Upgrade to Pro to enable Slack notifications, per-product thresholds, and more features!
              </p>
              <a href={`/billing?shop=${searchParams.shop}&host=${searchParams.host}`}>
                View Plans
              </a>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}