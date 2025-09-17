import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient, getGraphQLClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { sendLowStockAlert, sendOutOfStockAlert } from '@/lib/notifications';
import crypto from 'crypto';

async function verifyWebhook(req: NextRequest, body: string): Promise<boolean> {
  const hmacHeader = req.headers.get('x-shopify-hmac-sha256');
  if (!hmacHeader) {
    console.error('[WEBHOOK] No HMAC header found');
    return false;
  }

  // Use webhook secret if available, otherwise fall back to API secret
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_API_SECRET || '';

  const hash = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  const isValid = hash === hmacHeader;
  if (!isValid) {
    console.error('[WEBHOOK] HMAC verification failed');
  }

  return isValid;
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

    // Use the new request method instead of deprecated query method
    console.log(`[WEBHOOK] Fetching product for inventory_item_id: ${data.inventory_item_id}`);
    const response = await graphqlClient.request(query);
    console.log(`[WEBHOOK] GraphQL inventory response:`, JSON.stringify(response, null, 2));

    const productGID = response?.data?.inventoryItem?.variant?.product?.id;
    console.log(`[WEBHOOK] Extracted productGID: ${productGID}`);

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

      // Fetch product using GraphQL to avoid REST API deprecation
      const productQuery = `
        query getProduct($id: ID!) {
          product(id: $id) {
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
        }`;

      const productResponse = await graphqlClient.request(productQuery, {
        id: productGID
      });

      if (productResponse?.data?.product) {
        // Convert GraphQL response to REST format for compatibility
        const gqlProduct = productResponse.data.product;
        product = {
          id: gqlProduct.id.split('/').pop(),
          title: gqlProduct.title,
          status: gqlProduct.status.toLowerCase(),
          variants: gqlProduct.variants.edges.map((edge: any) => ({
            id: edge.node.id.split('/').pop(),
            title: edge.node.title,
            sku: edge.node.sku,
            inventory_quantity: edge.node.inventoryQuantity || 0
          }))
        };
      }

    } catch (apiError: any) {
    }
    
    if (!productId || !product) {
      console.error(`[WEBHOOK] Missing product data: productId=${productId}, product=${!!product}, productGID=${productGID}`);
      return NextResponse.json({
        warning: 'Could not determine product for inventory update'
      }, { status: 200 });
    }

    if (!productGID) {
      console.error(`[WEBHOOK] Missing productGID for product ${productId}`);
      return NextResponse.json({
        warning: 'Could not determine product GID for inventory update'
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
      console.log(`[AUTO-HIDE] Hiding product ${productId} (out of stock)`);
      console.log(`[AUTO-HIDE] Using productGID: ${productGID}`);

      try {
        // Use GraphQL mutation to update product status (avoiding REST API deprecation)
        const productUpdateMutation = `
          mutation productUpdate($product: ProductInput!) {
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
          product: {
            id: productGID,
            status: 'DRAFT'
          }
        });

        console.log(`[AUTO-HIDE] GraphQL Response:`, JSON.stringify(hideResponse, null, 2));

        if (hideResponse?.data?.productUpdate?.userErrors?.length > 0) {
          console.error(`[AUTO-HIDE] GraphQL userErrors:`, hideResponse.data.productUpdate.userErrors);
          throw new Error(`GraphQL errors: ${JSON.stringify(hideResponse.data.productUpdate.userErrors)}`);
        }

        console.log(`[AUTO-HIDE] Successfully set product ${productId} to draft`, hideResponse.data?.productUpdate?.product);

        await supabaseAdmin
          .from('inventory_tracking')
          .update({ is_hidden: true })
          .eq('store_id', store.id)
          .eq('product_id', productId);

        console.log(`[AUTO-HIDE] Updated is_hidden flag for product ${productId}`);
      } catch (error: any) {
        console.error(`[AUTO-HIDE] Failed to hide product ${productId}:`, error);
        console.error(`[AUTO-HIDE] Error details:`, {
          message: error.message,
          response: error.response?.body,
          status: error.response?.status,
        });
      }

      if (!excludeFromAlerts) {
        // Pass product with SKU for notification
        const productWithSku = { ...product, sku: existingTracking?.sku || updateData.sku };
        await sendOutOfStockAlert(store, productWithSku, null, settings);
      }
    }
    // Handle auto-republish when restocked
    // ONLY if: previous quantity was 0 AND new quantity is > 0 AND auto-republish is enabled
    else if (previousQuantity === 0 && totalQuantity > 0 && settings.auto_republish_enabled && !excludeFromAutoHide) {
      console.log(`[AUTO-REPUBLISH] Product ${productId} restocked: prev=${previousQuantity}, new=${totalQuantity}`);
      console.log(`[AUTO-REPUBLISH] Settings: auto_republish_enabled=${settings.auto_republish_enabled}, excludeFromAutoHide=${excludeFromAutoHide}`);
      console.log(`[AUTO-REPUBLISH] ProductGID being used: ${productGID}`);

      // Check if product is currently draft
      // We check both the is_hidden flag and the actual product status
      const isCurrentlyHidden = existingTracking?.is_hidden === true;
      const isProductDraft = product.status === 'draft';

      console.log(`[AUTO-REPUBLISH] Product ${productId} status: is_hidden=${isCurrentlyHidden}, status=${product.status}`);

      // Only republish if the product is actually in draft status
      if (isCurrentlyHidden || isProductDraft) {
        console.log(`[AUTO-REPUBLISH] Republishing product ${productId} from draft to active`);

        try {
          // Use GraphQL mutation to update product status (avoiding REST API deprecation)
          const productUpdateMutation = `
            mutation productUpdate($product: ProductInput!) {
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
            product: {
              id: productGID,
              status: 'ACTIVE'
            }
          });

          console.log(`[AUTO-REPUBLISH] GraphQL Response:`, JSON.stringify(updateResponse, null, 2));

          if (updateResponse?.data?.productUpdate?.userErrors?.length > 0) {
            console.error(`[AUTO-REPUBLISH] GraphQL userErrors:`, updateResponse.data.productUpdate.userErrors);
            throw new Error(`GraphQL errors: ${JSON.stringify(updateResponse.data.productUpdate.userErrors)}`);
          }

          console.log(`[AUTO-REPUBLISH] Successfully republished product ${productId}`, updateResponse.data?.productUpdate?.product);

          // Update the is_hidden flag in our database
          const { error: dbError } = await supabaseAdmin
            .from('inventory_tracking')
            .update({ is_hidden: false })
            .eq('store_id', store.id)
            .eq('product_id', productId);

          if (dbError) {
            console.error(`[AUTO-REPUBLISH] Database update error for product ${productId}:`, dbError);
          } else {
            console.log(`[AUTO-REPUBLISH] Updated is_hidden flag to false for product ${productId}`);
          }
        } catch (error: any) {
          console.error(`[AUTO-REPUBLISH] Failed to republish product ${productId}:`, error);
          console.error(`[AUTO-REPUBLISH] Error details:`, {
            message: error.message,
            response: error.response?.body,
            status: error.response?.status,
          });
        }
      } else {
        console.log(`[AUTO-REPUBLISH] Product ${productId} is already active, skipping republish`);
      }
    }
    // Log when conditions are not met
    else if (totalQuantity > 0 && settings.auto_republish_enabled) {
      if (previousQuantity > 0) {
        console.log(`[AUTO-REPUBLISH] Product ${productId} skipped: was not out of stock (prev=${previousQuantity})`);
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