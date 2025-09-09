import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { sendLowStockEmail } from '@/lib/email';
import { sendSlackNotification } from '@/lib/slack';
import { shopifyApi } from '@shopify/shopify-api';

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';
const SHOPIFY_API_VERSION = '2024-01';

export async function POST(request: NextRequest) {
  console.log('\n🔔 Inventory webhook received');
  
  const headersList = await headers();
  const hmacHeader = headersList.get('X-Shopify-Hmac-Sha256');
  const shopDomain = headersList.get('X-Shopify-Shop-Domain');
  
  if (!hmacHeader || !shopDomain) {
    console.error('Missing required headers');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rawBody = await request.text();
  
  // Verify webhook
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

  if (hash !== hmacHeader) {
    console.error('Invalid webhook signature');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data = JSON.parse(rawBody);
  console.log('📦 Inventory update:', data);
  
  const { inventory_item_id, location_id, available } = data;
  
  // Get store
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('shop_domain', shopDomain)
    .single();

  if (!store) {
    console.error('Store not found:', shopDomain);
    return NextResponse.json({ 
      success: true,
      warning: 'Store not found in database'
    }, { status: 200 });
  }

  // Initialize Shopify client
  const client = new shopifyApi({
    apiKey: process.env.NEXT_PUBLIC_SHOPIFY_API_KEY!,
    apiSecretKey: process.env.SHOPIFY_API_SECRET!,
    scopes: ['read_products', 'write_products'],
    hostName: process.env.NEXT_PUBLIC_APP_URL!.replace('https://', ''),
    apiVersion: SHOPIFY_API_VERSION,
  }).clients.Rest({ 
    session: {
      shop: store.shop_domain,
      accessToken: store.access_token,
    }
  });

  // OPTIMIZED: Use mapping table for O(1) lookup
  let productId: string | null = null;
  let product = null;
  
  // First, try to find product using our mapping table (fast lookup)
  const { data: mapping } = await supabaseAdmin
    .from('inventory_item_mapping')
    .select('product_id')
    .eq('inventory_item_id', inventory_item_id)
    .eq('store_id', store.id)
    .single();
  
  if (mapping?.product_id) {
    productId = mapping.product_id;
    console.log(`✅ Found product ${productId} from mapping table (O(1) lookup)`);
    
    try {
      // Fetch the complete product with all variants
      const fullProductResponse = await client.get({
        path: `products/${productId}`,
        query: { fields: 'id,title,status,variants' }
      });
      
      product = fullProductResponse.body.product;
    } catch (error) {
      console.error('Error fetching product:', error);
      // If product doesn't exist anymore, remove mapping
      await supabaseAdmin
        .from('inventory_item_mapping')
        .delete()
        .eq('inventory_item_id', inventory_item_id);
      productId = null;
    }
  }
  
  // If no mapping or product not found, do a fallback search (rare case)
  if (!productId || !product) {
    console.log('Mapping not found, falling back to search (this should be rare)...');
    
    try {
      const searchResponse = await client.get({
        path: `products`,
        query: { 
          fields: 'id,title,status,variants',
          limit: 250
        }
      });
      
      const products = searchResponse.body.products;
      
      for (const prod of products) {
        for (const variant of prod.variants) {
          if (variant.inventory_item_id === inventory_item_id || 
              variant.inventory_item_id === String(inventory_item_id)) {
            
            // Store mapping for next time
            await supabaseAdmin
              .from('inventory_item_mapping')
              .upsert({
                inventory_item_id,
                product_id: prod.id,
                variant_id: variant.id,
                store_id: store.id,
                updated_at: new Date().toISOString()
              });
            
            productId = prod.id;
            product = prod;
            console.log(`✅ Found and mapped product ${productId}`);
            break;
          }
        }
        if (productId) break;
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  }
  
  if (!productId || !product) {
    console.log('Product not found for inventory_item_id:', inventory_item_id);
    return NextResponse.json({ 
      success: true,
      warning: 'Product not tracked'
    }, { status: 200 });
  }
  
  // Calculate total quantity across all variants
  let totalQuantity = 0;
  for (const variant of product.variants) {
    totalQuantity += variant.inventory_quantity || 0;
  }
  
  // Get previous quantity
  const { data: existingTracking } = await supabaseAdmin
    .from('inventory_tracking')
    .select('current_quantity')
    .eq('store_id', store.id)
    .eq('product_id', productId)
    .single();
  
  const previousQuantity = existingTracking?.current_quantity || 0;
  
  // Update inventory tracking (product-level)
  const { data: existingProduct } = await supabaseAdmin
    .from('inventory_tracking')
    .select('id')
    .eq('store_id', store.id)
    .eq('product_id', productId)
    .single();

  const updateData = {
    store_id: store.id,
    product_id: productId,
    product_title: product.title,
    variant_title: null,
    sku: product.variants.map((v: any) => v.sku).filter(Boolean).join(', '),
    current_quantity: totalQuantity,
    previous_quantity: previousQuantity,
    is_hidden: existingTracking?.is_hidden || false,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (existingProduct) {
    await supabaseAdmin
      .from('inventory_tracking')
      .update(updateData)
      .eq('id', existingProduct.id);
  } else {
    await supabaseAdmin
      .from('inventory_tracking')
      .insert(updateData);
  }
  
  console.log(`✅ Updated product ${productId}: ${previousQuantity} -> ${totalQuantity} units`);
  
  // Check for alerts
  const { data: settings } = await supabaseAdmin
    .from('store_settings')
    .select('*')
    .eq('store_id', store.id)
    .single();
  
  const { data: productSettings } = await supabaseAdmin
    .from('product_settings')
    .select('*')
    .eq('store_id', store.id)
    .eq('product_id', productId)
    .single();
  
  if (!productSettings?.exclude_from_alerts) {
    const threshold = productSettings?.custom_threshold || 
                     settings?.low_stock_threshold || 5;
    
    if (totalQuantity <= threshold && totalQuantity > 0 && previousQuantity > totalQuantity) {
      // Low stock alert
      if (settings?.email_notifications && settings?.notification_email) {
        await sendLowStockEmail(
          settings.notification_email,
          product.title,
          totalQuantity,
          threshold
        );
      }
      
      if (settings?.slack_notifications && settings?.slack_webhook_url) {
        await sendSlackNotification(
          settings.slack_webhook_url,
          `Low stock alert: ${product.title} (${totalQuantity} remaining)`
        );
      }
      
      // Log alert
      await supabaseAdmin
        .from('alert_history')
        .insert({
          store_id: store.id,
          product_id: productId,
          product_title: product.title,
          alert_type: 'low_stock',
          quantity_at_alert: totalQuantity,
          threshold_triggered: threshold,
          sent_at: new Date().toISOString()
        });
    }
    
    if (totalQuantity === 0 && previousQuantity > 0) {
      // Out of stock alert
      if (settings?.email_notifications && settings?.notification_email) {
        await sendLowStockEmail(
          settings.notification_email,
          product.title,
          0,
          threshold
        );
      }
      
      if (settings?.slack_notifications && settings?.slack_webhook_url) {
        await sendSlackNotification(
          settings.slack_webhook_url,
          `Out of stock: ${product.title}`
        );
      }
      
      // Log alert
      await supabaseAdmin
        .from('alert_history')
        .insert({
          store_id: store.id,
          product_id: productId,
          product_title: product.title,
          alert_type: 'out_of_stock',
          quantity_at_alert: 0,
          threshold_triggered: 0,
          sent_at: new Date().toISOString()
        });
      
      // Auto-hide if enabled
      if (settings?.auto_hide_enabled && !productSettings?.exclude_from_auto_hide) {
        try {
          await client.put({
            path: `products/${productId}`,
            data: { product: { status: 'draft' } }
          });
          
          await supabaseAdmin
            .from('inventory_tracking')
            .update({ is_hidden: true })
            .eq('store_id', store.id)
            .eq('product_id', productId);
          
          console.log(`🙈 Auto-hidden product ${productId}`);
        } catch (error) {
          console.error('Error hiding product:', error);
        }
      }
    }
  }
  
  return NextResponse.json({ 
    success: true,
    product_id: productId,
    quantity: totalQuantity
  }, { status: 200 });
}