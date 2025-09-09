import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { registerWebhooks } from '@/lib/webhook-registration';

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

    console.log(`Manually registering webhooks for ${shop}...`);

    // Register webhooks
    await registerWebhooks(shop, store.access_token);

    // Verify registration by fetching the list
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
      return NextResponse.json({ 
        error: 'Failed to verify webhook registration' 
      }, { status: 500 });
    }

    const { webhooks } = await response.json();
    
    // Check which webhooks were registered
    const registeredTopics = webhooks.map((w: any) => w.topic);
    const expectedTopics = ['APP/UNINSTALLED', 'INVENTORY_LEVELS/UPDATE'];
    const missingTopics = expectedTopics.filter(topic => !registeredTopics.includes(topic));

    return NextResponse.json({
      success: true,
      message: 'Webhook registration completed',
      registered: registeredTopics,
      missing: missingTopics,
      total: webhooks.length
    });

  } catch (error) {
    console.error('Error registering webhooks:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}