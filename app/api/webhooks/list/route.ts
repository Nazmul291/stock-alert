import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGraphQLClient } from '@/lib/shopify';
import { requireSessionToken } from '@/lib/session-token';

export async function GET(req: NextRequest) {
  try {
    // Require valid session token for webhook management
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized'
      }, { status: 401 });
    }

    const shopDomain = authResult.shopDomain!;

    // Get store from database
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id, access_token')
      .eq('shop_domain', shopDomain)
      .single();

    if (storeError || !store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found or not authenticated' }, { status: 404 });
    }

    // Initialize GraphQL client
    const client = await getGraphQLClient(shopDomain, store.access_token);

    // Fetch registered webhooks from Shopify using GraphQL
    const query = `
      query getWebhookSubscriptions {
        webhookSubscriptions(first: 100) {
          edges {
            node {
              id
              topic
              createdAt
              updatedAt
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

    const response: any = await client.request(query);

    if (!response?.data?.webhookSubscriptions) {
      return NextResponse.json({
        error: 'Failed to fetch webhooks from Shopify'
      }, { status: 500 });
    }

    const webhooks = response.data.webhookSubscriptions.edges;

    // Format webhook data for easier reading
    const formattedWebhooks = webhooks.map((edge: any) => {
      const webhook = edge.node;
      return {
        id: webhook.id,
        topic: webhook.topic,
        address: webhook.endpoint?.callbackUrl || 'N/A',
        created_at: webhook.createdAt,
        updated_at: webhook.updatedAt,
        format: 'JSON',
        endpoint_type: webhook.endpoint?.__typename || 'Unknown'
      };
    });

    return NextResponse.json({
      shop: shopDomain,
      count: formattedWebhooks.length,
      webhooks: formattedWebhooks,
      expectedWebhooks: [
        'APP/UNINSTALLED',
        'INVENTORY_LEVELS/UPDATE'
      ]
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}