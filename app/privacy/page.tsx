'use client';

import { Card, Page, Layout, Text, BlockStack, Box, List, Divider, Link, Icon } from '@shopify/polaris';
import {
  LockIcon,
  DataTableIcon,
  NotificationIcon,
  LockFilledIcon,
  ClockIcon,
  PersonIcon,
  SettingsIcon,
  EmailIcon,
  EditIcon
} from '@shopify/polaris-icons';

export default function PrivacyPolicy() {
  const lastUpdated = new Date('2024-01-20').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <Page
      title="Privacy Policy"
      subtitle={`Last updated: ${lastUpdated}`}
      narrowWidth
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="800">
            {/* Introduction */}
            <Card>
              <BlockStack gap="400">
                <Text as="p" variant="bodyMd">
                  At Stock Alert, we take your privacy seriously. This Privacy Policy explains how we collect,
                  use, disclose, and safeguard your information when you use our Shopify application.
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  By using Stock Alert, you agree to the collection and use of information in accordance with this policy.
                </Text>
              </BlockStack>
            </Card>

            {/* Information We Collect */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={DataTableIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">1. Information We Collect</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <Text as="p" variant="bodyMd">
                  Stock Alert collects the following information to provide inventory management services:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Store Information:</Text>
                    {' '}Domain, email address, shop ID, and store settings
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Product Data:</Text>
                    {' '}Product names, SKUs, inventory levels, variants, and pricing
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Contact Information:</Text>
                    {' '}Email addresses for alert notifications
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Integration Data:</Text>
                    {' '}Slack workspace information (if connected)
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Usage Data:</Text>
                    {' '}App interactions and feature usage patterns
                  </List.Item>
                </List>
              </BlockStack>
            </Card>

            {/* How We Use Your Information */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={NotificationIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">2. How We Use Your Information</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <Text as="p" variant="bodyMd">
                  We use the collected information for the following purposes:
                </Text>
                <List type="bullet">
                  <List.Item>Monitor inventory levels and send real-time stock alerts</List.Item>
                  <List.Item>Automatically hide and republish products based on stock availability</List.Item>
                  <List.Item>Send low stock notifications via email or Slack</List.Item>
                  <List.Item>Generate inventory reports and analytics</List.Item>
                  <List.Item>Provide customer support and respond to inquiries</List.Item>
                  <List.Item>Improve app functionality and user experience</List.Item>
                  <List.Item>Ensure compliance with Shopify&apos;s API requirements</List.Item>
                </List>
              </BlockStack>
            </Card>

            {/* Data Storage and Security */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={LockFilledIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">3. Data Storage and Security</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd">
                    We implement industry-standard security measures to protect your information:
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Encryption:</Text>
                      {' '}All data is encrypted at rest and in transit using TLS/SSL protocols
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Secure Infrastructure:</Text>
                      {' '}Data is stored on Supabase with enterprise-grade security
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Access Control:</Text>
                      {' '}Strict authentication and authorization mechanisms
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Regular Audits:</Text>
                      {' '}Periodic security reviews and updates
                    </List.Item>
                  </List>
                  <Box paddingBlockStart="200">
                    <Text as="p" variant="bodyMd" tone="subdued">
                      While we strive to protect your data, no method of transmission over the internet is 100% secure.
                    </Text>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Data Sharing */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={LockIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">4. Data Sharing</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <Text as="p" variant="bodyMd">
                  We <Text as="span" fontWeight="bold">do not sell, trade, or rent</Text> your information to third parties.
                  We only share data with:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Shopify:</Text>
                    {' '}For app functionality and API operations
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Slack:</Text>
                    {' '}Only if you enable Slack notifications
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Email Service Providers:</Text>
                    {' '}For sending alert notifications (with your consent)
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Legal Requirements:</Text>
                    {' '}When required by law or to protect our rights
                  </List.Item>
                </List>
              </BlockStack>
            </Card>

            {/* Data Retention */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={ClockIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">5. Data Retention</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd">
                    We retain your data according to the following guidelines:
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Active Accounts:</Text>
                      {' '}Data is retained as long as you use our app
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">After Uninstallation:</Text>
                      {' '}Data is deleted within 30 days
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Legal Obligations:</Text>
                      {' '}Some data may be retained longer if required by law
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Backup Data:</Text>
                      {' '}Backup copies are purged within 90 days
                    </List.Item>
                  </List>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Your Rights */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={PersonIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">6. Your Rights</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <Text as="p" variant="bodyMd">
                  You have the following rights regarding your personal data:
                </Text>
                <List type="bullet">
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Access:</Text>
                    {' '}Request a copy of your personal data
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Correction:</Text>
                    {' '}Request correction of inaccurate data
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Deletion:</Text>
                    {' '}Request deletion of your data (right to be forgotten)
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Portability:</Text>
                    {' '}Export your data in a machine-readable format
                  </List.Item>
                  <List.Item>
                    <Text as="span" variant="bodyMd" fontWeight="semibold">Opt-out:</Text>
                    {' '}Unsubscribe from notifications at any time
                  </List.Item>
                </List>
                <Box paddingBlockStart="200">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    To exercise these rights, contact us at info@nazmulcodes.org
                  </Text>
                </Box>
              </BlockStack>
            </Card>

            {/* GDPR Compliance */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">7. GDPR Compliance</Text>
                <Text as="p" variant="bodyMd">
                  For merchants in the European Union, we comply with GDPR requirements:
                </Text>
                <List type="bullet">
                  <List.Item>Lawful basis for data processing</List.Item>
                  <List.Item>Explicit consent for data collection</List.Item>
                  <List.Item>Data portability and right to deletion</List.Item>
                  <List.Item>Privacy by design principles</List.Item>
                  <List.Item>Data breach notification procedures</List.Item>
                  <List.Item>Appointment of Data Protection Officer (if required)</List.Item>
                </List>
              </BlockStack>
            </Card>

            {/* Cookies */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={SettingsIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">8. Cookies</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd">
                    Stock Alert uses minimal cookies for essential functionality:
                  </Text>
                  <List type="bullet">
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Session Cookies:</Text>
                      {' '}For authentication and security
                    </List.Item>
                    <List.Item>
                      <Text as="span" variant="bodyMd" fontWeight="semibold">Preference Cookies:</Text>
                      {' '}To remember your settings
                    </List.Item>
                  </List>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    We do not use tracking or advertising cookies.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Policy Updates */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={EditIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">9. Policy Updates</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <Text as="p" variant="bodyMd">
                  We may update this Privacy Policy periodically to reflect changes in our practices or for legal reasons.
                </Text>
                <List type="bullet">
                  <List.Item>Significant changes will be notified via email or app dashboard</List.Item>
                  <List.Item>The &quot;Last updated&quot; date will be revised</List.Item>
                  <List.Item>Continued use after updates constitutes acceptance</List.Item>
                </List>
              </BlockStack>
            </Card>

            {/* Contact Information */}
            <Card>
              <BlockStack gap="400">
                <Box>
                  <BlockStack gap="200">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Icon source={EmailIcon} tone="base" />
                      <div style={{ flexGrow: 1 }}>
                        <Text as="h2" variant="headingMd">10. Contact Us</Text>
                      </div>
                    </div>
                  </BlockStack>
                </Box>
                <Text as="p" variant="bodyMd">
                  For privacy concerns, questions, or to exercise your rights, please contact us:
                </Text>
                <BlockStack gap="200">
                  <Box paddingBlockStart="200">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodyMd">
                        <Text as="span" fontWeight="semibold">Email:</Text>{' '}
                        <Link url="mailto:info@nazmulcodes.org" external>info@nazmulcodes.org</Link>
                      </Text>
                      <Text as="p" variant="bodyMd">
                        <Text as="span" fontWeight="semibold">Website:</Text>{' '}
                        <Link url="https://stock-alert.nazmulcodes.org" external>stock-alert.nazmulcodes.org</Link>
                      </Text>
                      <Text as="p" variant="bodyMd">
                        <Text as="span" fontWeight="semibold">Response Time:</Text>{' '}
                        Within 48 hours on business days
                      </Text>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Footer */}
            <Card>
              <Box padding="400" background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Divider />
                  <Box paddingBlockStart="200">
                    <BlockStack gap="200">
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        © {new Date().getFullYear()} Stock Alert. All rights reserved.
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        This privacy policy is effective as of {lastUpdated}
                      </Text>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}