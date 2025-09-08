import { NextRequest, NextResponse } from 'next/server';
import { shopify, getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { sendLowStockAlert, sendOutOfStockAlert } from '@/lib/notifications';
import crypto from 'crypto';

async function verifyWebhook(req: NextRequest, body: string): Promise<boolean> {
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  if (!hmacHeader) return false;

  const hash = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET!)
    .update(body, 'utf8')
    .digest('base64');

  return hash === hmacHeader;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    
    // Verify webhook
    const isValid = await verifyWebhook(req, body);
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const shop = req.headers.get('x-shopify-shop-domain');
    
    if (!shop) {
      return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 });
    }

    // Get store from database
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get store settings
    const { data: settings } = await supabaseAdmin
      .from('store_settings')
      .select('*')
      .eq('store_id', store.id)
      .single();

    if (!settings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 });
    }

    // Log webhook event
    await supabaseAdmin
      .from('webhook_events')
      .insert({
        store_id: store.id,
        topic: 'inventory_levels/update',
        payload: data,
        processed: false,
      });

    const { inventory_item_id, location_id, available } = data;

    // Get product and variant information from Shopify
    const client = await getShopifyClient(shop, store.access_token);
    
    // Get inventory item details
    const inventoryItemResponse = await client.get({
      path: `inventory_items/${inventory_item_id}`,
    });
    
    const inventoryItem = inventoryItemResponse.body.inventory_item;
    const variantId = inventoryItem.variant_id;
    
    if (!variantId) {
      return NextResponse.json({ message: 'No variant associated' }, { status: 200 });
    }

    // Get variant details
    const variantResponse = await client.get({
      path: `variants/${variantId}`,
    });
    
    const variant = variantResponse.body.variant;
    const productId = variant.product_id;

    // Get product details
    const productResponse = await client.get({
      path: `products/${productId}`,
    });
    
    const product = productResponse.body.product;

    // Check for product-specific settings
    const { data: productSettings } = await supabaseAdmin
      .from('product_settings')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .single();

    const threshold = productSettings?.custom_threshold || settings.low_stock_threshold;
    const excludeFromAutoHide = productSettings?.exclude_from_auto_hide || false;
    const excludeFromAlerts = productSettings?.exclude_from_alerts || false;

    // Update inventory tracking
    const { data: existingTracking } = await supabaseAdmin
      .from('inventory_tracking')
      .select('*')
      .eq('store_id', store.id)
      .eq('variant_id', variantId)
      .single();

    const previousQuantity = existingTracking?.current_quantity || 0;

    await supabaseAdmin
      .from('inventory_tracking')
      .upsert({
        store_id: store.id,
        product_id: productId,
        variant_id: variantId,
        product_title: product.title,
        variant_title: variant.title,
        sku: variant.sku,
        current_quantity: available,
        previous_quantity: previousQuantity,
        last_checked_at: new Date().toISOString(),
      });

    // Handle auto-hide for sold out products
    if (available === 0 && settings.auto_hide_enabled && !excludeFromAutoHide) {
      // Hide the product
      await client.put({
        path: `products/${productId}`,
        data: {
          product: {
            id: productId,
            published: false,
          },
        },
      });

      // Update tracking
      await supabaseAdmin
        .from('inventory_tracking')
        .update({ is_hidden: true })
        .eq('store_id', store.id)
        .eq('variant_id', variantId);

      // Send out of stock alert
      if (!excludeFromAlerts) {
        await sendOutOfStockAlert(store, product, variant, settings);
      }
    }

    // Handle auto-republish when restocked
    if (previousQuantity === 0 && available > 0 && settings.auto_republish_enabled) {
      // Check if product was hidden
      const { data: tracking } = await supabaseAdmin
        .from('inventory_tracking')
        .select('is_hidden')
        .eq('store_id', store.id)
        .eq('variant_id', variantId)
        .single();

      if (tracking?.is_hidden) {
        // Republish the product
        await client.put({
          path: `products/${productId}`,
          data: {
            product: {
              id: productId,
              published: true,
            },
          },
        });

        // Update tracking
        await supabaseAdmin
          .from('inventory_tracking')
          .update({ is_hidden: false })
          .eq('store_id', store.id)
          .eq('variant_id', variantId);
      }
    }

    // Handle low stock alerts
    if (available > 0 && available <= threshold && !excludeFromAlerts) {
      // Check if we should send alert (avoid spam)
      const shouldSendAlert = !existingTracking?.last_alert_sent_at || 
        new Date().getTime() - new Date(existingTracking.last_alert_sent_at).getTime() > 24 * 60 * 60 * 1000; // 24 hours

      if (shouldSendAlert) {
        await sendLowStockAlert(store, product, variant, available, threshold, settings);
        
        // Update last alert sent time
        await supabaseAdmin
          .from('inventory_tracking')
          .update({ last_alert_sent_at: new Date().toISOString() })
          .eq('store_id', store.id)
          .eq('variant_id', variantId);
      }
    }

    // Mark webhook as processed
    await supabaseAdmin
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('store_id', store.id)
      .eq('topic', 'inventory_levels/update')
      .order('created_at', { ascending: false })
      .limit(1);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Inventory webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}