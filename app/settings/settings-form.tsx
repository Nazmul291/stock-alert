'use client';

import { useState, useTransition } from 'react';
import { FormLayout, TextField, Checkbox, Button, Select, Banner } from '@shopify/polaris';
import { updateStoreSettings } from '@/app/actions/settings';

interface SettingsFormProps {
  settings: {
    auto_hide_enabled: boolean;
    auto_republish_enabled: boolean;
    low_stock_threshold: number;
    email_notifications: boolean;
    slack_notifications: boolean;
    slack_webhook_url: string;
    notification_email: string;
  };
  plan: string;
  shop: string;
}

export default function SettingsForm({ settings: initialSettings, plan, shop }: SettingsFormProps) {
  // Ensure string fields are never null/undefined to prevent controlled/uncontrolled input issues
  const normalizedSettings = {
    ...initialSettings,
    notification_email: initialSettings.notification_email || '',
    slack_webhook_url: initialSettings.slack_webhook_url || ''
  };
  
  const [settings, setSettings] = useState(normalizedSettings);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    Object.entries(settings).forEach(([key, value]) => {
      formData.append(key, String(value));
    });

    startTransition(async () => {
      try {
        await updateStoreSettings(formData, shop);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(`Failed to save settings: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    });
  };

  const thresholdOptions = [
    { label: '1 item', value: '1' },
    { label: '3 items', value: '3' },
    { label: '5 items', value: '5' },
    { label: '10 items', value: '10' },
    { label: '15 items', value: '15' },
    { label: '20 items', value: '20' },
    { label: '25 items', value: '25' },
    { label: '50 items', value: '50' },
  ];

  return (
    <form onSubmit={handleSubmit}>
      <FormLayout>
        {plan !== 'pro' && (
          <Banner tone="info">
            <p>
              Some advanced features are disabled on the free plan. <a href={`/billing?shop=${shop}`} style={{ color: '#0066CC', textDecoration: 'underline' }}>Upgrade to Professional</a> to unlock auto-republish, per-product settings, and more.
            </p>
          </Banner>
        )}

        {success && (
          <Banner tone="success" onDismiss={() => setSuccess(false)}>
            Settings saved successfully!
          </Banner>
        )}

        {error && (
          <Banner tone="critical" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <Checkbox
          label="Automatically hide sold-out products"
          checked={settings.auto_hide_enabled}
          onChange={(value) => setSettings({ ...settings, auto_hide_enabled: value })}
          helpText="Products with zero inventory will be automatically unpublished from your store"
        />

        <Checkbox
          label="Automatically republish when restocked"
          checked={settings.auto_republish_enabled}
          onChange={(value) => setSettings({ ...settings, auto_republish_enabled: value })}
          helpText="Products will be automatically published again when inventory is added"
          disabled={!settings.auto_hide_enabled || plan !== 'pro'}
        />

        <Select
          label="Low stock threshold"
          options={thresholdOptions}
          value={settings.low_stock_threshold.toString()}
          onChange={(value) => setSettings({ ...settings, low_stock_threshold: parseInt(value) })}
          helpText="Alert me when inventory falls below this amount"
        />

        <Checkbox
          label="Email notifications"
          checked={settings.email_notifications}
          onChange={(value) => setSettings({ ...settings, email_notifications: value })}
        />
        
        {settings.email_notifications && (
          <TextField
            label="Notification email"
            type="email"
            value={settings.notification_email || ''}
            onChange={(value) => setSettings({ ...settings, notification_email: value })}
            placeholder="alerts@example.com"
            helpText="Leave empty to use store owner email"
            autoComplete="email"
          />
        )}

        <Checkbox
          label="Slack notifications"
          checked={settings.slack_notifications}
          onChange={(value) => setSettings({ ...settings, slack_notifications: value })}
        />
        
        {settings.slack_notifications && (
          <>
            {plan === 'free' && (
              <Banner tone="warning">
                Your current free plan doesn't support Slack notifications. To receive Slack notifications, please upgrade to Pro.
              </Banner>
            )}
            <TextField
              label="Slack webhook URL"
              type="url"
              value={settings.slack_webhook_url || ''}
              onChange={(value) => setSettings({ ...settings, slack_webhook_url: value })}
              placeholder="https://hooks.slack.com/services/..."
              disabled={plan === 'free'}
              helpText={
                <>
                  Follow these steps to obtain a Slack webhook URL:
                  <br />
                  1. Go to <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer" style={{ color: '#0066CC', textDecoration: 'underline' }}>https://api.slack.com/messaging/webhooks</a>
                  <br />
                  2. Click "Create your Slack app"
                  <br />
                  3. Select "From scratch", give it a name, and choose your workspace
                  <br />
                  4. Go to "Incoming Webhooks" → Enable it
                  <br />
                  5. Click "Add New Webhook to Workspace"
                  <br />
                  6. Choose a channel and copy the Webhook URL
                </>
              }
              autoComplete="url"
            />
          </>
        )}

        <Button
          submit
          variant="primary"
          loading={isPending}
        >
          Save Settings
        </Button>
      </FormLayout>
    </form>
  );
}