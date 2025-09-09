export interface WebhookConfig {
  topic: string;
  address: string;
}

export async function registerWebhooks(shop: string, accessToken: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_HOST || 'https://dev.nazmulcodes.org';
  
  // Only register the essential webhooks for inventory tracking
  // NOTE: Shopify webhook topics are lowercase!
  const webhooks: WebhookConfig[] = [
    {
      topic: 'app/uninstalled',
      address: `${appUrl}/api/webhooks/uninstall`,
    },
    {
      topic: 'inventory_levels/update', 
      address: `${appUrl}/api/webhooks/inventory`,
    },
  ];

  console.log(`Registering webhooks for ${shop}...`);

  for (const webhook of webhooks) {
    try {
      // First, check if webhook already exists
      const checkResponse = await fetch(
        `https://${shop}/admin/api/2024-01/webhooks.json`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (checkResponse.ok) {
        const { webhooks: existingWebhooks } = await checkResponse.json();
        const exists = existingWebhooks.some(
          (w: any) => w.topic === webhook.topic && w.address === webhook.address
        );

        if (exists) {
          console.log(`Webhook ${webhook.topic} already registered`);
          continue;
        }
      }

      // Register the webhook
      const response = await fetch(
        `https://${shop}/admin/api/2024-01/webhooks.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            webhook: {
              topic: webhook.topic,
              address: webhook.address,
              format: 'json',
            },
          }),
        }
      );

      if (response.ok) {
        const webhookData = await response.json();
        console.log(`Successfully registered webhook: ${webhook.topic} with ID: ${webhookData.webhook.id}`);
        console.log(`Webhook address: ${webhookData.webhook.address}`);
      } else {
        const errorText = await response.text();
        console.error(`Failed to register webhook ${webhook.topic}:`, errorText);
        console.error(`Status: ${response.status}, URL: ${webhook.address}`);
        
        // Try to parse error for more details
        try {
          const errorJson = JSON.parse(errorText);
          console.error('Error details:', errorJson);
        } catch {
          // Not JSON, already logged as text
        }
      }
    } catch (error) {
      console.error(`Error registering webhook ${webhook.topic}:`, error);
    }
  }

  console.log('Webhook registration complete');
}