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
  console.log('📦 INVENTORY WEBHOOK RECEIVED');
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  try {
    const body = await req.text();
    console.log('Body:', body);
    
    // Verify webhook
    const isValid = await verifyWebhook(req, body);
    if (!isValid) {
      console.error('❌ Webhook verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = JSON.parse(body);
    const shop = req.headers.get('x-shopify-shop-domain');
    
    console.log('📊 Webhook data:', {
      shop,
      inventory_item_id: data.inventory_item_id,
      location_id: data.location_id,
      available: data.available
    });
    
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

    // Shopify sends different field names depending on the webhook version
    const inventory_item_id = data.inventory_item_id || data.id;
    const location_id = data.location_id;
    const available = data.available !== undefined ? data.available : data.inventory_quantity;

    // Get product and variant information from Shopify
    const client = await getShopifyClient(shop, store.access_token);
    
    let variantId, productId, product, variant;
    
    try {
      // First, let's search through ALL products to find which variant has this inventory_item_id
      console.log(`Searching for variant with inventory_item_id: ${inventory_item_id}...`);
      
      // Fetch all products with their variants (including inventory_item_id)
      const searchResponse = await client.get({
        path: `products`,
        query: { 
          fields: 'id,title,variants',
          limit: 250
        }
      });
      
      const products = searchResponse.body.products;
      console.log(`Searching through ${products.length} products for inventory_item_id ${inventory_item_id}`);
      
      // Search through all products and variants
      for (const prod of products) {
        for (const var_ of prod.variants) {
          // Check if this variant's inventory_item_id matches
          if (var_.inventory_item_id === inventory_item_id || 
              var_.inventory_item_id === String(inventory_item_id)) {
            console.log(`✅ Found variant ${var_.id} for inventory item ${inventory_item_id}`);
            
            // IMPORTANT: Now fetch the COMPLETE product with ALL variants and their current inventory
            console.log(`Fetching complete product ${prod.id} with all variants...`);
            const fullProductResponse = await client.get({
              path: `products/${prod.id}`,
              query: { fields: 'id,title,status,variants' }
            });
            
            product = fullProductResponse.body.product;
            productId = product.id;
            
            // Find the specific variant that triggered the webhook
            variant = product.variants.find(v => 
              v.inventory_item_id === inventory_item_id || 
              v.inventory_item_id === String(inventory_item_id)
            );
            variantId = variant?.id;
            
            console.log('Complete product data:', {
              product_id: product.id,
              product_title: product.title,
              total_variants: product.variants.length,
              variants: product.variants.map(v => ({
                id: v.id,
                title: v.title,
                sku: v.sku,
                inventory_quantity: v.inventory_quantity,
                inventory_item_id: v.inventory_item_id
              }))
            });
            
            break;
          }
        }
        if (productId) break;
      }
      
      // If not found in products, try getting inventory item details
      if (!variantId) {
        console.log('Variant not found in products, trying inventory_items API...');
        
        try {
          const inventoryItemResponse = await client.get({
            path: `inventory_items/${inventory_item_id}`,
          });
          
          const inventoryItem = inventoryItemResponse.body.inventory_item;
          console.log('Inventory item details:', inventoryItem);
          
          // Some Shopify API versions include variant_id in inventory item
          if (inventoryItem.variant_id) {
            variantId = inventoryItem.variant_id;
            console.log(`Found variant_id ${variantId} in inventory item`);
            
            // Get variant and product details
            const variantResponse = await client.get({
              path: `variants/${variantId}`,
            });
            variant = variantResponse.body.variant;
            productId = variant.product_id;
            
            const productResponse = await client.get({
              path: `products/${productId}`,
            });
            product = productResponse.body.product;
          }
        } catch (invError) {
          console.error('Error fetching inventory item:', invError);
        }
      }
      
      // Last resort: check our existing database
      if (!variantId) {
        console.log('Still no variant found, checking our database...');
        
        // In our next sync, we should store inventory_item_id in our database
        // For now, this won't work but let's keep it for future
        const { data: existingItems } = await supabaseAdmin
          .from('inventory_tracking')
          .select('*')
          .eq('store_id', store.id);
        
        console.log(`Checking ${existingItems?.length || 0} existing items in database`);
      }
      
      if (!variantId) {
        console.log('⚠️ WARNING: Could not determine variant for inventory_item_id:', inventory_item_id);
        console.log('This might be a new product not yet synced');
      }
    } catch (apiError: any) {
      console.error('Error fetching Shopify data:', apiError);
      console.error('API Error details:', apiError.response?.body || apiError.message);
    }

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

    // PRODUCT-LEVEL TRACKING: We track the entire product, not individual variants
    if (!productId || !product) {
      console.error('Cannot update inventory: no product information available');
      return NextResponse.json({ error: 'No product information' }, { status: 400 });
    }
    
    // Calculate total quantity across all variants
    let totalQuantity = 0;
    let variantDetails = [];
    
    if (product.variants && product.variants.length > 0) {
      for (const v of product.variants) {
        totalQuantity += v.inventory_quantity || 0;
        variantDetails.push({
          title: v.title,
          sku: v.sku,
          quantity: v.inventory_quantity || 0
        });
      }
    }
    
    console.log(`Product ${productId} inventory summary:`, {
      total_quantity: totalQuantity,
      variant_count: product.variants?.length || 0,
      variants: variantDetails
    });
    
    // Get existing product tracking
    const { data: existingTracking } = await supabaseAdmin
      .from('inventory_tracking')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .single();

    const previousQuantity = existingTracking?.current_quantity || 0;
    
    // Update product-level inventory
    const updateData = {
      store_id: store.id,
      product_id: productId,
      product_title: product.title,
      variant_title: null, // No longer tracking individual variants
      sku: variantDetails.map(v => v.sku).filter(Boolean).join(', '), // Combine all SKUs
      current_quantity: totalQuantity,
      previous_quantity: previousQuantity,
      is_hidden: existingTracking?.is_hidden || false,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    const { error: upsertError } = await supabaseAdmin
      .from('inventory_tracking')
      .upsert(updateData, {
        onConflict: 'store_id,product_id'
      });
    
    if (upsertError) {
      console.error('Error updating product inventory:', upsertError);
      throw upsertError;
    }
    
    console.log(`✅ Updated product ${productId}: ${previousQuantity} -> ${totalQuantity} total units`);
    
    // Handle auto-hide for completely out of stock products
    if (totalQuantity === 0 && settings.auto_hide_enabled && !excludeFromAutoHide) {
      console.log(`🚫 Product ${productId} is completely out of stock - hiding product`);
      await client.put({
        path: `products/${productId}`,
        data: {
          product: {
            id: productId,
            status: 'draft',
          },
        },
      });
      
      // Update tracking
      await supabaseAdmin
        .from('inventory_tracking')
        .update({ is_hidden: true })
        .eq('store_id', store.id)
        .eq('product_id', productId);
      
      // Send out of stock alert
      if (!excludeFromAlerts) {
        await sendOutOfStockAlert(store, product, null, settings);
      }
    }
      
      // Update all variants at once (will insert new ones or update existing)
      const { error: batchUpdateError } = await supabaseAdmin
        .from('inventory_tracking')
        .upsert(allVariantUpdates, {
          onConflict: 'store_id,variant_id',
          ignoreDuplicates: false
        });
      
      if (batchUpdateError) {
        console.error('Error batch updating variants:', batchUpdateError);
      } else {
        console.log(`✅ Successfully updated ${allVariantUpdates.length} variants for product ${productId}`);
        console.log(`✅ Total product quantity: ${totalProductQuantity} (sum of all variants)`);
      }
      
      // Use total product quantity for threshold checks
      const threshold = productSettings?.custom_threshold || settings.low_stock_threshold;
      console.log(`Product ${productId}: Total qty=${totalProductQuantity}, Threshold=${threshold}`);
      
      // Analyze product stock status
      const variantsInStock = allVariantUpdates.filter(v => v.current_quantity > 0).length;
      const variantsOutOfStock = allVariantUpdates.filter(v => v.current_quantity === 0).length;
      const allVariantsOutOfStock = variantsOutOfStock === allVariantUpdates.length;
      const someVariantsOutOfStock = variantsOutOfStock > 0 && variantsOutOfStock < allVariantUpdates.length;
      
      console.log(`📊 Product Stock Analysis:`);
      console.log(`   - Total variants: ${allVariantUpdates.length}`);
      console.log(`   - In stock: ${variantsInStock}`);
      console.log(`   - Out of stock: ${variantsOutOfStock}`);
      console.log(`   - All out of stock: ${allVariantsOutOfStock}`);
      console.log(`   - Partial stock: ${someVariantsOutOfStock}`);
      
      // Determine product action based on settings and stock status
      let shouldHideProduct = false;
      let hideReason = '';
      
      if (settings.auto_hide_enabled && !excludeFromAutoHide) {
        // Option 1: Hide only if ALL variants are out of stock (default behavior)
        if (allVariantsOutOfStock) {
          shouldHideProduct = true;
          hideReason = 'All variants out of stock';
        }
        
        // Option 2: You could also hide if MOST variants are out (configurable)
        // const hideThreshold = 0.8; // Hide if 80% of variants are out
        // if (variantsOutOfStock / allVariantUpdates.length >= hideThreshold) {
        //   shouldHideProduct = true;
        //   hideReason = `${variantsOutOfStock}/${allVariantUpdates.length} variants out of stock`;
        // }
      }
      
      // Update product visibility if needed
      if (shouldHideProduct) {
        console.log(`🚫 Hiding product: ${hideReason}`);
        await client.put({
          path: `products/${productId}`,
          data: {
            product: {
              id: productId,
              status: 'draft', // Set to draft instead of unpublished
            },
          },
        });
        
        // Mark all variants as hidden in our database
        await supabaseAdmin
          .from('inventory_tracking')
          .update({ is_hidden: true })
          .eq('store_id', store.id)
          .eq('product_id', productId);
          
        // Send out of stock alert
        if (!excludeFromAlerts) {
          await sendOutOfStockAlert(store, product, null, settings);
        }
      } else if (settings.auto_republish_enabled && prevTracking?.is_hidden && variantsInStock > 0) {
        // Republish if previously hidden and now has stock
        console.log(`✅ Republishing product: ${variantsInStock} variants back in stock`);
        await client.put({
          path: `products/${productId}`,
          data: {
            product: {
              id: productId,
              status: 'active',
            },
          },
        });
        
        // Mark all variants as visible in our database
        await supabaseAdmin
          .from('inventory_tracking')
          .update({ is_hidden: false })
          .eq('store_id', store.id)
          .eq('product_id', productId);
      }
      
      // Handle low stock alerts based on total quantity
      if (totalProductQuantity > 0 && totalProductQuantity <= threshold && !excludeFromAlerts) {
        // Check if we should send alert (avoid spam)
        const { data: lastAlert } = await supabaseAdmin
          .from('inventory_tracking')
          .select('last_alert_sent_at')
          .eq('store_id', store.id)
          .eq('product_id', productId)
          .not('last_alert_sent_at', 'is', null)
          .order('last_alert_sent_at', { ascending: false })
          .limit(1)
          .single();
        
        const shouldSendAlert = !lastAlert?.last_alert_sent_at || 
          new Date().getTime() - new Date(lastAlert.last_alert_sent_at).getTime() > 24 * 60 * 60 * 1000;
        
        if (shouldSendAlert) {
          console.log(`⚠️ Sending low stock alert: ${totalProductQuantity} units remaining`);
          await sendLowStockAlert(store, product, null, totalProductQuantity, threshold, settings);
          
          // Update last alert time for all variants of this product
          await supabaseAdmin
            .from('inventory_tracking')
            .update({ last_alert_sent_at: new Date().toISOString() })
            .eq('store_id', store.id)
            .eq('product_id', productId);
        }
      }
    }

    // Skip the old auto-hide logic since we handled it above
    const totalQuantity = product?.variants?.reduce((sum: number, v: any) => sum + (v.inventory_quantity || 0), 0) || available;
    
    // Handle auto-hide for sold out products (ALL variants are 0) - SKIP THIS, already handled above
    if (false && totalQuantity === 0 && settings.auto_hide_enabled && !excludeFromAutoHide) {
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

    // Handle low stock alerts (check against total product quantity)
    if (totalQuantity > 0 && totalQuantity <= threshold && !excludeFromAlerts) {
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

    console.log('✅ Inventory webhook processed successfully');
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('❌ Inventory webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}