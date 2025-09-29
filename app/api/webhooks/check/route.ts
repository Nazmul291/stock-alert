import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getShopifyClient } from '@/lib/shopify';

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
      .select('*')
      .eq('shop_domain', shop)
      .single();

    if (storeError || !store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found or not authenticated' }, { status: 404 });
    }

    const client = await getShopifyClient(shop, store.access_token);

    // Fetch registered webhooks using the REST client
    const webhooksResponse = await client.get({
      path: 'webhooks.json',
    });

    const webhooks = webhooksResponse.body.webhooks;

    // Check webhook events in database
    const { data: recentEvents } = await supabaseAdmin
      .from('webhook_events')
      .select('*')
      .eq('store_id', store.id)
      .order('created_at', { ascending: false })
      .limit(10);

    // Expected webhooks for this app
    const expectedWebhooks = [
      { topic: 'inventory_levels/update', endpoint: '/api/webhooks/inventory' },
      { topic: 'products/update', endpoint: '/api/webhooks/inventory' },
      { topic: 'products/delete', endpoint: '/api/webhooks/inventory' },
      { topic: 'app/uninstalled', endpoint: '/api/webhooks/uninstall' },
      { topic: 'customers/data_request', endpoint: '/api/webhooks/compliance' },
      { topic: 'customers/redact', endpoint: '/api/webhooks/compliance' },
      { topic: 'shop/redact', endpoint: '/api/webhooks/compliance' },
    ];

    // Check which webhooks are registered
    const registeredTopics = webhooks.map((w: any) => ({
      topic: w.topic,
      address: w.address,
      created_at: w.created_at,
      api_version: w.api_version,
    }));

    // Find missing webhooks
    const missingWebhooks = expectedWebhooks.filter(expected =>
      !registeredTopics.some(registered =>
        registered.topic.toLowerCase() === expected.topic.toLowerCase()
      )
    );

    // Group webhooks by status
    const webhookStatus = {
      inventory_tracking: {
        'inventory_levels/update': registeredTopics.find(w => w.topic.toLowerCase() === 'inventory_levels/update'),
        'products/update': registeredTopics.find(w => w.topic.toLowerCase() === 'products/update'),
        'products/delete': registeredTopics.find(w => w.topic.toLowerCase() === 'products/delete'),
      },
      compliance: {
        'customers/data_request': registeredTopics.find(w => w.topic.toLowerCase() === 'customers/data_request'),
        'customers/redact': registeredTopics.find(w => w.topic.toLowerCase() === 'customers/redact'),
        'shop/redact': registeredTopics.find(w => w.topic.toLowerCase() === 'shop/redact'),
      },
      app_lifecycle: {
        'app/uninstalled': registeredTopics.find(w => w.topic.toLowerCase() === 'app/uninstalled'),
      }
    };

    return NextResponse.json({
      success: true,
      shop,
      summary: {
        total_registered: registeredTopics.length,
        expected_count: expectedWebhooks.length,
        missing_count: missingWebhooks.length,
      },
      webhook_status: webhookStatus,
      missing_webhooks: missingWebhooks,
      all_registered_webhooks: registeredTopics,
      recent_webhook_events: recentEvents?.map(event => ({
        topic: event.topic,
        created_at: event.created_at,
        processed: event.processed,
      })),
      recommendations: missingWebhooks.length > 0 ? [
        'Some webhooks are missing. Run webhook registration to fix this.',
        'Make sure your app URL is correctly configured in environment variables.',
      ] : [
        'All expected webhooks are registered correctly.',
      ],
    });

  } catch (error) {
    console.error('Webhook check error:', error);
    return NextResponse.json({
      error: 'Failed to check webhooks',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}