import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

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

    // Fetch registered webhooks from Shopify
    console.log(`Fetching webhooks for ${shop}...`);
    
    const response = await fetch(
      `https://${shop}/admin/api/2024-01/webhooks.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch webhooks:', response.status);
      return NextResponse.json({ 
        error: `Failed to fetch webhooks from Shopify (${response.status})` 
      }, { status: 500 });
    }

    const { webhooks } = await response.json();
    
    // Format webhook data for easier reading
    const formattedWebhooks = webhooks.map((webhook: any) => ({
      id: webhook.id,
      topic: webhook.topic,
      address: webhook.address,
      created_at: webhook.created_at,
      updated_at: webhook.updated_at,
      format: webhook.format,
      api_version: webhook.api_version,
    }));

    return NextResponse.json({
      shop,
      count: webhooks.length,
      webhooks: formattedWebhooks,
      expectedWebhooks: [
        'APP/UNINSTALLED',
        'INVENTORY_LEVELS/UPDATE'
      ]
    });

  } catch (error) {
    console.error('Error listing webhooks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}