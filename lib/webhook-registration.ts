import { getGraphQLClient } from '@/lib/shopify';

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


  // Initialize GraphQL client
  const client = await getGraphQLClient(shop, accessToken);

  for (const webhook of webhooks) {
    try {
      // First, check if webhook already exists using GraphQL
      const checkQuery = `
        query getWebhookSubscriptions {
          webhookSubscriptions(first: 100) {
            edges {
              node {
                id
                topic
                endpoint {
                  __typename
                  ... on WebhookHttpEndpoint {
                    callbackUrl
                  }
                }
              }
            }
          }
        }
      `;

      const checkResponse: any = await client.request(checkQuery);

      if (checkResponse?.data?.webhookSubscriptions) {
        const existingWebhooks = checkResponse.data.webhookSubscriptions.edges;
        const exists = existingWebhooks.some(
          (edge: any) => {
            const node = edge.node;
            return node.topic === webhook.topic.toUpperCase().replace('/', '_') &&
                   node.endpoint?.callbackUrl === webhook.address;
          }
        );

        if (exists) {
          continue;
        }
      }

      // Register the webhook using GraphQL
      const createMutation = `
        mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
            webhookSubscription {
              id
              topic
              endpoint {
                __typename
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      // Convert topic format (e.g., "app/uninstalled" -> "APP_UNINSTALLED")
      const graphqlTopic = webhook.topic.toUpperCase().replace('/', '_');

      const response: any = await client.request(createMutation, {
        variables: {
          topic: graphqlTopic,
          webhookSubscription: {
            callbackUrl: webhook.address,
            format: 'JSON'
          }
        }
      });

      if (response?.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
        // Errors occurred but we handle them silently
        // response.data.webhookSubscriptionCreate.userErrors
      }
    } catch (error) {
      // Handle error silently
    }
  }

}