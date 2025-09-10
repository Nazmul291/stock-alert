import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient, getGraphQLClient, ShopifyResponse } from '@/lib/shopify';
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
    const graphqlClient = await getGraphQLClient(shop, store.access_token)

    const query = `
      query {
        inventoryItem(id: "gid://shopify/InventoryItem/${data.inventory_item_id}") {
          variant {
            product {
              id
            }
          }
        }
      }`
    
    const response = await graphqlClient.query({ data: query });


    const productGID = (response as ShopifyResponse).body?.data.inventoryItem?.variant?.product?.id;

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

    const client = await getShopifyClient(shop, store.access_token);
    
    // Find which product this inventory_item_id belongs to
    let productId = productGID.split('/').pop();
    let product = null;
    
    try {
      
      // Fetch all products to find the one with this inventory_item_id
      const searchResponse = await client.get({
        path: `products/${productId}`,
        query: {
          fields: 'id,title,status,variants'
        }
      });
      
      product = searchResponse.body.product;

    } catch (apiError: any) {
    }
    
    if (!productId || !product) {
      return NextResponse.json({ 
        warning: 'Could not determine product for inventory update' 
      }, { status: 200 });
    }
    
    // Calculate total quantity across all variants
    let totalQuantity = 0;
    const variantDetails = [];
    
    for (const variant of product.variants) {
      totalQuantity += variant.inventory_quantity || 0;
      variantDetails.push({
        title: variant.title,
        sku: variant.sku,
        quantity: variant.inventory_quantity || 0
      });
    }
    
    
    // Get existing product tracking
    const { data: existingTracking } = await supabaseAdmin
      .from('inventory_tracking')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .single();

    const previousQuantity = existingTracking?.current_quantity || 0;
    
    // Check if quantity actually changed - skip notifications if same
    if (totalQuantity === previousQuantity) {
      return NextResponse.json({ 
        success: true,
        info: 'Quantity unchanged, notifications skipped'
      }, { status: 200 });
    }

    // Update product-level inventory (no variant_id!)
    const updateData = {
      store_id: store.id,
      product_id: productId,
      product_title: product.title,
      variant_title: null, // Not tracking individual variants
      sku: variantDetails.map(v => v.sku).filter(Boolean).join(', '),
      current_quantity: totalQuantity,
      previous_quantity: previousQuantity,
      is_hidden: existingTracking?.is_hidden || false,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    // Check if product exists in our tracking
    const { data: existingProduct } = await supabaseAdmin
      .from('inventory_tracking')
      .select('id')
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .single();

    if (existingProduct) {
      // Update existing product
      const { error: updateError } = await supabaseAdmin
        .from('inventory_tracking')
        .update(updateData)
        .eq('id', existingProduct.id);
      
      if (updateError) {
        // Still return success to avoid webhook retries
        return NextResponse.json({ 
          success: true,
          warning: 'Database update failed, but webhook accepted'
        }, { status: 200 });
      }
    } else {
      // Insert new product
      const { error: insertError } = await supabaseAdmin
        .from('inventory_tracking')
        .insert(updateData);
      
      if (insertError) {
        // Still return success to Shopify - we don't want retries
        return NextResponse.json({ 
          success: true,
          warning: 'Product not in database, skipping update'
        }, { status: 200 });
      }
    }
    
    // Get product-specific settings
    const { data: productSettings } = await supabaseAdmin
      .from('product_settings')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .single();

    const threshold = productSettings?.custom_threshold || settings.low_stock_threshold;
    const excludeFromAutoHide = productSettings?.exclude_from_auto_hide || false;
    const excludeFromAlerts = productSettings?.exclude_from_alerts || false;
    
    // Handle auto-hide for completely out of stock products
    if (totalQuantity === 0 && settings.auto_hide_enabled && !excludeFromAutoHide) {
      
      await client.put({
        path: `products/${productId}`,
        data: {
          product: {
            id: productId,
            status: 'draft',
          },
        },
      });
      
      await supabaseAdmin
        .from('inventory_tracking')
        .update({ is_hidden: true })
        .eq('store_id', store.id)
        .eq('product_id', productId);
      
      if (!excludeFromAlerts) {
        // Pass product with SKU for notification
        const productWithSku = { ...product, sku: existingTracking?.sku || updateData.sku };
        await sendOutOfStockAlert(store, productWithSku, null, settings);
      }
    } 
    // Handle auto-republish when restocked
    else if (previousQuantity === 0 && totalQuantity > 0 && settings.auto_republish_enabled) {
      if (existingTracking?.is_hidden) {
        
        await client.put({
          path: `products/${productId}`,
          data: {
            product: {
              id: productId,
              status: 'active',
            },
          },
        });
        
        await supabaseAdmin
          .from('inventory_tracking')
          .update({ is_hidden: false })
          .eq('store_id', store.id)
          .eq('product_id', productId);
      }
    }
    
    // Handle low stock alerts
    if (totalQuantity > 0 && totalQuantity <= threshold && !excludeFromAlerts) {
      // Set cooldown to prevent spam (24 hours for production)
      const cooldownMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      const shouldSendAlert = !existingTracking?.last_alert_sent_at || 
        new Date().getTime() - new Date(existingTracking.last_alert_sent_at).getTime() > cooldownMs;
      
      
      if (shouldSendAlert) {
        // Pass product with SKU for notification
        const productWithSku = { ...product, sku: existingTracking?.sku || updateData.sku };
        await sendLowStockAlert(store, productWithSku, null, totalQuantity, threshold, settings);
        
        await supabaseAdmin
          .from('inventory_tracking')
          .update({ last_alert_sent_at: new Date().toISOString() })
          .eq('store_id', store.id)
          .eq('product_id', productId);
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
    // IMPORTANT: Return 200 to prevent Shopify from retrying
    // We log the error but don't want webhook retries for internal issues
    return NextResponse.json({ 
      success: true,
      warning: 'Webhook processed with errors, check logs'
    }, { status: 200 });
  }
}