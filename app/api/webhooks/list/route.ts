import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getGraphQLClient } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop parameter required' }, { status: 400 });
    }

    // Get store from database
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id, access_token')
      .eq('shop_domain', shop)
      .single();

    if (storeError || !store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found or not authenticated' }, { status: 404 });
    }

    // Initialize GraphQL client
    const client = await getGraphQLClient(shop, store.access_token);

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

    if (!response?.webhookSubscriptions) {
      return NextResponse.json({
        error: 'Failed to fetch webhooks from Shopify'
      }, { status: 500 });
    }

    const webhooks = response.webhookSubscriptions.edges;

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
      shop,
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