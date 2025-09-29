// This webhook handler processes inventory_levels/update webhooks
// It triggers when inventory quantities change (not product status changes)
// For auto-hide/republish to work, ensure inventory_levels/update webhook is registered

import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient, getGraphQLClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { sendLowStockAlert, sendOutOfStockAlert } from '@/lib/notifications';
import crypto from 'crypto';

// In-memory cache for duplicate prevention (3-second TTL)
const requestCache = new Map<string, number>();

// Auto-cleanup function to remove expired cache entries
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, timestamp] of requestCache.entries()) {
    if (now - timestamp > 3000) { // 3 seconds
      requestCache.delete(key);
    }
  }
};

// Run cleanup every 10 seconds
setInterval(cleanupCache, 10000);

async function verifyWebhook(req: NextRequest, body: string): Promise<boolean> {
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  if (!hmacHeader) {
    return false;
  }

  // Use webhook secret if available, otherwise fall back to API secret
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '';

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  const isValid = hash === hmacHeader;
  return isValid;
}

// Background processing function
async function processInventoryUpdate(
  data: any,
  shop: string,
  webhookTopic: string
) {
  try {
    // Get store from database
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      console.error('[Webhook] Store not found:', shop);
      console.error('[Webhook] Store query error:', storeError);
      return;
    }

    console.log('[Webhook] Found store:', {
      id: store.id,
      id_type: typeof store.id,
      shop_domain: store.shop_domain
    });

    const graphqlClient = await getGraphQLClient(shop, store.access_token);

    // Continue with the rest of the processing...
    // For inventory_levels/update webhook, the structure is different
    const inventoryItemId = data.inventory_item_id;

    if (!inventoryItemId) {
      console.log('No inventory item ID in webhook payload');
      return;
    }

    // Rest of the processing logic will follow...
    await processInventoryLogic(data, store, graphqlClient, inventoryItemId);
  } catch (error) {
    console.error('Error processing inventory update:', error);
    // Log error to database for debugging
    try {
      await supabaseAdmin
        .from('webhook_errors')
        .insert({
          shop_domain: shop,
          topic: webhookTopic,
          error_message: error instanceof Error ? error.message : 'Unknown error',
          payload: data,
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Failed to log webhook error:', logError);
    }
  }
}

// Main processing logic extracted to separate function
async function processInventoryLogic(
  data: any,
  store: any,
  graphqlClient: any,
  inventoryItemId: string
) {
  // This function contains the main processing logic
  // Moved from the main POST handler for async processing

  const query = `
    query {
      inventoryItem(id: "gid://shopify/InventoryItem/${inventoryItemId}") {
        variant {
          product {
            id
            title
            status
            variants(first: 250) {
              edges {
                node {
                  id
                  title
                  sku
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`;

  const response = await graphqlClient.request(query);
  const product = response?.data?.inventoryItem?.variant?.product;
  if (!product) {
    console.log('Could not determine product GID for inventory update');
    return;
  }

  // Continue with the rest of the processing logic...
  // (All the remaining logic from the original handler will be here)
  await continueProcessing(data, store, graphqlClient, product);
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
    const webhookTopic = req.headers.get('x-shopify-topic');

    if (!shop) {
      return NextResponse.json({ error: 'Missing shop domain' }, { status: 400 });
    }

    // IMMEDIATE CACHE-BASED DUPLICATE PREVENTION
    if (webhookTopic === 'inventory_levels/update') {
      const inventoryItemId = data.inventory_item_id;
      const cacheKey = `${shop}_${inventoryItemId}_${data.available || 0}`;
      const now = Date.now();

      // Check if this exact request is already cached (within 3 seconds)
      if (requestCache.has(cacheKey)) {
        const cachedTime = requestCache.get(cacheKey)!;
        if (now - cachedTime < 3000) { // 3 seconds
          console.log(`[Webhook] CACHE BLOCKED: Duplicate inventory update for ${inventoryItemId} (${now - cachedTime}ms ago)`);
          return NextResponse.json({
            success: true,
            message: 'Duplicate request blocked by cache'
          }, { status: 200 });
        }
      }

      // Cache this request immediately
      requestCache.set(cacheKey, now);
      console.log(`[Webhook] CACHE SET: ${cacheKey} cached for 3 seconds`);
    }

    // Handle products/update webhooks separately
    if (webhookTopic === 'products/update') {
      // For products/update webhooks, we don't need to process inventory changes
      return NextResponse.json({
        success: true,
        message: 'Product update webhook received',
        product_id: data.id
      }, { status: 200 });
    }

    // Only process inventory_levels/update webhooks
    if (webhookTopic !== 'inventory_levels/update') {
      return NextResponse.json({
        success: true,
        message: `Webhook topic ${webhookTopic} not handled by this endpoint`
      }, { status: 200 });
    }

    // IMMEDIATE RESPONSE - Send 200 OK to Shopify right away
    // This prevents 408 timeout errors

    // Process the webhook asynchronously in the background
    // Using setImmediate or process.nextTick to ensure response is sent first
    setImmediate(() => {
      processInventoryUpdate(data, shop, webhookTopic).catch(error => {
        console.error('Background processing error:', error);
      });
    });

    // Return success immediately to Shopify
    return NextResponse.json({
      success: true,
      message: 'Webhook received and queued for processing'
    }, { status: 200 })
  } catch (error) {
    // IMPORTANT: Return 200 to prevent Shopify from retrying
    // We log the error but don't want webhook retries for internal issues
    return NextResponse.json({
      success: true,
      warning: 'Webhook processed with errors, check logs'
    }, { status: 200 });
  }
}

// Move the rest of the processing logic to the continueProcessing function
async function continueProcessing(
  data: any,
  store: any,
  graphqlClient: any,
  product: any
) {
  // Get store settings
  const { data: settings } = await supabaseAdmin
    .from('store_settings')
    .select('*')
    .eq('store_id', store.id)
    .single();

  if (!settings) {
    console.error('Settings not found for store:', store.id);
    return;
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

  // Find which product this inventory_item_id belongs to
  const productId = product.id.split('/').pop();


  if (!product) {
    console.log('Could not determine product for inventory update');
    return;
  }
    
    // Calculate total quantity across all variants
    let totalQuantity = 0;
    const variantDetails = [];
    
    console.log("product full details", product);
    for (const variantNode of product.variants.edges) {
      const variant = variantNode.node;
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

    // Check if product is deactivated (for plan limits)
    const previousStatus = existingTracking?.inventory_status || 'in_stock';

    if (previousStatus === 'deactivated') {
      console.log('[Webhook] Skipping deactivated product:', product.title);
      return; // Skip processing for deactivated products
    }

    // Get product-specific settings first (needed for threshold calculation)
    const { data: productSettings } = await supabaseAdmin
      .from('product_settings')
      .select('*')
      .eq('store_id', store.id)
      .eq('product_id', productId)
      .single();

    // Determine inventory status based on quantity and settings
    const threshold = productSettings?.custom_threshold || settings.low_stock_threshold;
    let newStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | 'deactivated';

    console.log('[Webhook] Status determination:', {
      totalQuantity,
      threshold,
      settings_threshold: settings.low_stock_threshold,
      product_threshold: productSettings?.custom_threshold
    });

    if (totalQuantity === 0) {
      newStatus = 'out_of_stock';
    } else if (totalQuantity <= threshold) {
      newStatus = 'low_stock';
    } else {
      newStatus = 'in_stock';
    }

    console.log('[Webhook] Status change check:', {
      product: product.title,
      previousStatus,
      newStatus,
      quantity: totalQuantity,
      threshold,
      statusChanged: previousStatus !== newStatus
    });

    // Update product-level inventory (no variant_id!)
    const updateData = {
      store_id: store.id,
      product_id: productId,
      product_title: product.title,
      variant_title: null, // Not tracking individual variants
      sku: variantDetails.map(v => v.sku).filter(Boolean).join(', '),
      current_quantity: totalQuantity,
      previous_quantity: previousQuantity,
      inventory_status: newStatus,
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
      // Check plan limits before adding new product
      const { canAddProduct } = await import('@/lib/plan-enforcement');
      const canAdd = await canAddProduct(store.id);

      if (!canAdd.canAdd) {
        console.log('[Webhook] Cannot add product due to plan limits:', canAdd.reason);
        // Insert as deactivated if plan limit is reached
        updateData.inventory_status = 'deactivated';
      }

      // Insert new product
      const { error: insertError } = await supabaseAdmin
        .from('inventory_tracking')
        .insert(updateData);

      if (insertError) {
        console.error('[Webhook] Failed to insert new product:', insertError);
        // Still return success to Shopify - we don't want retries
        return NextResponse.json({
          success: true,
          warning: 'Product not in database, skipping update'
        }, { status: 200 });
      }

      if (!canAdd.canAdd) {
        console.log('[Webhook] Product added as deactivated due to plan limits');
        return; // Skip further processing for deactivated products
      }
    }

    // Extract product-specific exclusion settings
    const excludeFromAutoHide = productSettings?.exclude_from_auto_hide || false;
    const excludeFromAlerts = productSettings?.exclude_from_alerts || false;
    
    // Status-based alert system - only send alerts when status changes
    if (previousStatus !== newStatus && !excludeFromAlerts) {
      console.log('[Webhook] Status changed, sending alert:', {
        product: product.title,
        productId: productId,
        previousStatus,
        newStatus,
        timestamp: new Date().toISOString()
      });

      // Create unique webhook ID for tracking duplicates
      const webhookId = `webhook_${store.id}_${productId}_${Date.now()}`;
      console.log('[Webhook] Processing webhook:', webhookId);

      // Check for recent alerts to prevent duplicates (within last 5 seconds)
      const fiveSecondsAgo = new Date(Date.now() - 5 * 1000).toISOString();
      let alertType = '';

      if (newStatus === 'out_of_stock' && previousStatus !== 'out_of_stock') {
        alertType = 'out_of_stock';
      } else if (newStatus === 'low_stock' && previousStatus === 'in_stock') {
        alertType = 'low_stock';
      } else if (newStatus === 'in_stock' && previousStatus !== 'in_stock') {
        alertType = 'restock';
      }

      if (alertType) {
        // Status-based alert system - send alerts when status changes
        if (previousStatus !== newStatus && !excludeFromAlerts) {
          console.log('[Webhook] Status changed, sending alert:', {
            product: product.title,
            productId: productId,
            previousStatus,
            newStatus,
            timestamp: new Date().toISOString()
          });
          const productWithSku = { ...product, sku: existingTracking?.sku || updateData.sku };

          if (newStatus === 'out_of_stock' && previousStatus !== 'out_of_stock') {
            console.log('[Webhook] Sending out of stock alert for:', product.title);
            await sendOutOfStockAlert(store, productWithSku, null, settings);
          } else if (newStatus === 'low_stock' && previousStatus === 'in_stock') {
            console.log('[Webhook] Sending low stock alert for:', product.title);
            await sendLowStockAlert(store, productWithSku, null, totalQuantity, threshold, settings);
          } else if (newStatus === 'in_stock' && previousStatus !== 'in_stock') {
            console.log('[Webhook] Sending restock alert for:', product.title);
            const { sendRestockAlert } = await import('@/lib/notifications');
            await sendRestockAlert(store, productWithSku, null, totalQuantity, settings);
          }
        } else if (previousStatus === newStatus) {
          console.log('[Webhook] Status unchanged, no alert needed:', {
            product: product.title,
            status: newStatus,
            quantity: totalQuantity
          });
        } else {
          console.log('[Webhook] Alert excluded for product:', product.title);
        }
      }
    } else if (previousStatus === newStatus) {
      console.log('[Webhook] Status unchanged, no alert needed:', {
        product: product.title,
        status: newStatus,
        quantity: totalQuantity
      });
    } else {
      console.log('[Webhook] Alert excluded for product:', product.title);
    }

    // Handle auto-hide for completely out of stock products
    if (newStatus === 'out_of_stock' && settings.auto_hide_enabled && !excludeFromAutoHide) {
      try {
        // Use GraphQL mutation to update product status (avoiding REST API deprecation)
        const productUpdateMutation = `
          mutation productUpdate($product: ProductUpdateInput) {
            productUpdate(product: $product) {
              product {
                id
                status
              }
              userErrors {
                field
                message
              }
            }
          }`;

        const hideResponse = await graphqlClient.request(productUpdateMutation, {
          variables: {
            product: {
              id: productGID,
              status: 'DRAFT'
            }
          }
        });

        if (hideResponse?.data?.productUpdate?.userErrors?.length > 0) {
          throw new Error(`GraphQL errors: ${JSON.stringify(hideResponse.data.productUpdate.userErrors)}`);
        }

        await supabaseAdmin
          .from('inventory_tracking')
          .update({ is_hidden: true })
          .eq('store_id', store.id)
          .eq('product_id', productId);

      } catch (error: any) {
        // Error caught but not logged in production
      }
    }
    // Handle auto-republish when restocked
    // ONLY if: previous quantity was 0 AND new quantity is > 0 AND auto-republish is enabled
    else if (previousQuantity === 0 && totalQuantity > 0 && settings.auto_republish_enabled && !excludeFromAutoHide) {
      
      
      

      // Check if product is currently draft
      // We check both the is_hidden flag and the actual product status
      const isCurrentlyHidden = existingTracking?.is_hidden === true;
      const isProductDraft = product.status === 'draft';

      

      // Only republish if the product is actually in draft status
      if (isCurrentlyHidden || isProductDraft) {
        

        try {
          // Use GraphQL mutation to update product status (avoiding REST API deprecation)
          const productUpdateMutation = `
            mutation productUpdate($product: ProductUpdateInput) {
              productUpdate(product: $product) {
                product {
                  id
                  status
                }
                userErrors {
                  field
                  message
                }
              }
            }`;

          const updateResponse = await graphqlClient.request(productUpdateMutation, {
            variables: {
              product: {
                id: productGID,
                status: 'ACTIVE'
              }
            }
          });

          

          if (updateResponse?.data?.productUpdate?.userErrors?.length > 0) {
            
            throw new Error(`GraphQL errors: ${JSON.stringify(updateResponse.data.productUpdate.userErrors)}`);
          }

          

          // Update the is_hidden flag in our database
          const { error: dbError } = await supabaseAdmin
            .from('inventory_tracking')
            .update({ is_hidden: false })
            .eq('store_id', store.id)
            .eq('product_id', productId);

          if (dbError) {
            
          } else {
            
          }
        } catch (error: any) {
          // Error caught but not logged in production
        }
      } else {
        
      }
    }
    // Log when conditions are not met
    else if (totalQuantity > 0 && settings.auto_republish_enabled) {
      if (previousQuantity > 0) {
        
      }
    }
    
    // Old cooldown-based alert system has been removed
    // Now using status-based alerts above
    
    // Mark webhook as processed
    await supabaseAdmin
      .from('webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('store_id', store.id)
      .eq('topic', 'inventory_levels/update')
      .order('created_at', { ascending: false })
      .limit(1);

}