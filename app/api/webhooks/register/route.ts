import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { registerWebhooks } from '@/lib/webhook-registration';
import { getGraphQLClient } from '@/lib/shopify';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shop } = body;

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


    // Register webhooks
    await registerWebhooks(shop, store.access_token);

    // Initialize GraphQL client for verification
    const client = await getGraphQLClient(shop, store.access_token);

    // Verify registration by fetching the list using GraphQL
    const query = `
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

    const response: any = await client.request(query);

    if (!response?.data?.webhookSubscriptions) {
      return NextResponse.json({
        error: 'Failed to verify webhook registration'
      }, { status: 500 });
    }

    const webhooks = response.data.webhookSubscriptions.edges;

    // Check which webhooks were registered
    const registeredTopics = webhooks.map((edge: any) => edge.node.topic);
    const expectedTopics = ['APP/UNINSTALLED', 'INVENTORY_LEVELS/UPDATE'];
    const missingTopics = expectedTopics.filter(topic => !registeredTopics.includes(topic));

    return NextResponse.json({
      success: true,
      message: 'Webhook registration completed',
      registered: registeredTopics,
      missing: missingTopics,
      total: registeredTopics.length
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}