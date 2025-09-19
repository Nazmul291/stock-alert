import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PLAN_LIMITS } from '@/lib/plan-limits';
import { getSessionTokenFromRequest, getShopFromToken } from '@/lib/session-token';
import { getGraphQLClient } from '@/lib/shopify';

export async function GET(req: NextRequest) {
  try {
    // Try to get shop from session token first
    let shop: string | null = null;
    const sessionToken = await getSessionTokenFromRequest(req);
    if (sessionToken) {
      shop = getShopFromToken(sessionToken);
    } else {
      // Fall back to query param for backward compatibility
      shop = req.nextUrl.searchParams.get('shop');
    }

    if (!shop) {
      return NextResponse.json({ error: 'Shop not identified' }, { status: 400 });
    }

    // Get store from database with plan information
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, access_token, plan')
      .eq('shop_domain', shop)
      .single();

    if (!store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found or not authenticated' }, { status: 404 });
    }

    // Get current plan limits
    const plan = store.plan || 'free';
    const planLimits = PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS];
    const maxProducts = planLimits.maxProducts;

    // Get current distinct product count for this store
    const { data: currentProducts } = await supabaseAdmin
      .from('inventory_tracking')
      .select('product_id')
      .eq('store_id', store.id);

    // Count distinct products (not variants) - ensure all IDs are strings for comparison
    const distinctProductIds = new Set(currentProducts?.map(p => String(p.product_id)) || []);
    const currentProductCount = distinctProductIds.size;


    // Initialize GraphQL client
    const client = await getGraphQLClient(shop, store.access_token);

    // First, verify the access token is valid with a lightweight GraphQL query
    try {
      const shopQuery = `
        query getShop {
          shop {
            id
            name
          }
        }
      `;

      await client.request(shopQuery);
    } catch (error: any) {
      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        return NextResponse.json({
          error: 'Authentication failed. The access token is invalid or expired. Please reinstall the app.',
          requiresReauth: true
        }, { status: 401 });
      }
      throw error;
    }

    // Fetch products from Shopify using GraphQL with pagination
    const pageSize = 250; // Shopify's max limit per page
    const maxFetchLimit = plan === 'free' ? 10 : 10000; // Free: 10 products, Pro: 10000 products

    const productsQuery = `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after) {
          edges {
            node {
              id
              title
              handle
              status
              totalInventory
              tracksInventory
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    inventoryQuantity
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    let products = [];
    let hasNextPage = true;
    let cursor = null;

    try {
      // Fetch products with pagination
      while (hasNextPage && products.length < maxFetchLimit) {
        // For free plan, fetch only what's needed (10 products max)
        const effectivePageSize = plan === 'free' ? Math.min(10, pageSize) : pageSize;
        const currentPageSize = Math.min(effectivePageSize, maxFetchLimit - products.length);

        const response: any = await client.request(productsQuery, {
          variables: {
            first: currentPageSize,
            after: cursor
          }
        });

        // Transform GraphQL response to match existing format
        if (!response || !response.products) {
          throw new Error('Invalid response from Shopify GraphQL API');
        }

        const pageProducts = response.products.edges.map((edge: any) => {
          const product = edge.node;
          // Extract numeric ID from GID
          const productId = product.id.split('/').pop();

          return {
            id: productId,
            title: product.title,
            handle: product.handle,
            status: product.status,
            variants: product.variants.edges.map((vEdge: any) => {
              const variant = vEdge.node;
              const variantId = variant.id.split('/').pop();
              const inventoryItemId = variant.inventoryItem?.id?.split('/').pop();

              return {
                id: variantId,
                title: variant.title,
                sku: variant.sku,
                inventory_quantity: variant.inventoryQuantity || 0,
                inventory_item_id: inventoryItemId
              };
            })
          };
        });

        products.push(...pageProducts);

        // Check if there are more pages
        hasNextPage = response.products.pageInfo.hasNextPage;
        cursor = response.products.pageInfo.endCursor;

        // Break if we've reached the plan limit
        if (products.length >= maxFetchLimit) {
          break;
        }
      }

      // Trim to exact limit if we fetched more
      if (products.length > maxFetchLimit) {
        products = products.slice(0, maxFetchLimit);
      }
    } catch (error: any) {
      // Handle specific error cases
      if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        return NextResponse.json({
          error: 'Authentication failed. The app may need to be re-installed or re-authenticated.',
          requiresReauth: true
        }, { status: 401 });
      } else if (error.message?.includes('Forbidden') || error.message?.includes('403')) {
        return NextResponse.json({
          error: 'Permission denied. The app may not have the required permissions to access products.'
        }, { status: 403 });
      } else if (error.message?.includes('Throttled') || error.message?.includes('429')) {
        return NextResponse.json({
          error: 'Rate limit exceeded. Please try again in a few moments.'
        }, { status: 429 });
      }

      // Generic error
      return NextResponse.json({
        error: `Failed to fetch products from Shopify: ${error.message}`
      }, { status: 500 });
    }

    // We already have the distinct product IDs from above
    const existingProductIds = distinctProductIds;
    const existingProductCount = currentProductCount;

    // Calculate how many products we can sync based on plan limits
    const remainingSlots = Math.max(0, maxProducts - existingProductCount);

    if (remainingSlots === 0 && plan === 'free') {
      const upgradeMessage = 'Please upgrade to Professional to sync more products.';

      return NextResponse.json({
        error: `Product limit reached. You have already synced ${existingProductCount}/${maxProducts} products on the ${plan} plan. ${upgradeMessage}`,
        currentCount: existingProductCount,
        maxProducts: maxProducts,
        plan: plan,
        quotaFull: true
      }, { status: 403 });
    }

    // Process and store products in database
    const inventoryData = [];
    const productsToSync = [];
    let newProductCount = 0;
    let updatedProductCount = 0;

    // For Pro plan, sync ALL products. For Free plan, respect the limit
    for (const product of products) {
      const productIdStr = String(product.id);
      const isExistingProduct = existingProductIds.has(productIdStr);

      if (!isExistingProduct) {
        // New product
        if (plan === 'pro' || newProductCount < remainingSlots) {
          productsToSync.push(product);
          newProductCount++;
        }
      } else {
        // Existing product - always update
        productsToSync.push(product);
        updatedProductCount++;
      }
    }

    
    // Collect inventory mappings for webhook optimization
    const inventoryMappings = [];
    
    // PRODUCT-LEVEL TRACKING: Store one row per product, not per variant
    for (const product of productsToSync) {
      // Calculate total quantity across all variants
      let totalQuantity = 0;
      const skus = [];
      
      for (const variant of product.variants) {
        totalQuantity += variant.inventory_quantity || 0;
        if (variant.sku) skus.push(variant.sku);
        
        // Collect inventory item mappings for fast webhook lookups
        if (variant.inventory_item_id) {
          inventoryMappings.push({
            inventory_item_id: variant.inventory_item_id,
            product_id: product.id,
            variant_id: variant.id,
            store_id: store.id,
            updated_at: new Date().toISOString()
          });
        }
      }
      
      inventoryData.push({
        store_id: store.id,
        product_id: product.id,
        product_title: product.title,
        variant_title: null, // Not tracking individual variants anymore
        sku: skus.join(', ') || null, // Combine all SKUs
        current_quantity: totalQuantity,
        previous_quantity: totalQuantity,
        is_hidden: false,
        last_checked_at: new Date().toISOString(),
      });
    }
    
    // Batch upsert inventory mappings for webhook optimization (if table exists)
    if (inventoryMappings.length > 0) {
      try {
        const { error: mappingError } = await supabaseAdmin
          .from('inventory_item_mapping')
          .upsert(inventoryMappings, { onConflict: 'inventory_item_id' });
        
        if (mappingError) {
          // Table might not exist yet - this is OK, will work after migration
        }
      } catch (error) {
        // Silently skip if table doesn't exist
      }
    }

    // Batch upsert inventory data - much faster than individual operations
    if (inventoryData.length > 0) {
      // Get all existing products in one query
      const { data: existingProducts } = await supabaseAdmin
        .from('inventory_tracking')
        .select('id, product_id')
        .eq('store_id', store.id)
        .in('product_id', inventoryData.map(item => item.product_id));

      // Create a map for quick lookups - ensure keys are strings
      const existingMap = new Map(
        existingProducts?.map(p => [String(p.product_id), p.id]) || []
      );

      // Separate into updates and inserts
      const updates = [];
      const inserts = [];

      for (const item of inventoryData) {
        // Ensure product_id is a string for consistent comparison
        const productIdString = String(item.product_id);
        const existingId = existingMap.get(productIdString);

        if (existingId) {
          updates.push({
            ...item,
            id: existingId,
            updated_at: new Date().toISOString()
          });
        } else {
          inserts.push({
            ...item,
            updated_at: new Date().toISOString()
          });
        }
      }

      // Perform batch operations
      const errors = [];

      // Batch insert new products
      if (inserts.length > 0) {
        const { error } = await supabaseAdmin
          .from('inventory_tracking')
          .insert(inserts);

        if (error) {
          errors.push(`Insert error: ${error.message}`);
        }
      }

      // Batch update existing products (Supabase upsert handles this)
      if (updates.length > 0) {
        const { error } = await supabaseAdmin
          .from('inventory_tracking')
          .upsert(updates);

        if (error) {
          errors.push(`Update error: ${error.message}`);
        }
      }

      if (errors.length > 0) {
        // Log errors but continue - don't fail the whole sync for partial errors
        console.error('Sync encountered some errors:', errors);
      }
    }

    // Get updated product data with settings
    const { data: productsData } = await supabaseAdmin
      .from('inventory_tracking')
      .select(`
        *,
        product_settings!left (
          custom_threshold,
          exclude_from_auto_hide,
          exclude_from_alerts
        )
      `)
      .eq('store_id', store.id)
      .order('product_title', { ascending: true });

    // Group by product
    const groupedProducts = productsData?.reduce((acc: any, item: any) => {
      const key = item.product_id;
      if (!acc[key]) {
        acc[key] = {
          product_id: item.product_id,
          product_title: item.product_title,
          variants: [],
          total_quantity: 0,
          settings: item.product_settings || null,
        };
      }
      acc[key].variants.push(item);
      acc[key].total_quantity += item.current_quantity;
      return acc;
    }, {});

    const productsList = Object.values(groupedProducts || {});

    // Include sync status information
    const syncInfo: any = {
      totalProductsInStore: products.length,
      syncedProducts: productsToSync.length,
      newProductsSynced: newProductCount,
      existingProductsUpdated: productsToSync.length - newProductCount,
      currentTotalProducts: existingProductCount + newProductCount,
      maxAllowed: maxProducts,
      plan: plan,
      remainingSlots: Math.max(0, maxProducts - (existingProductCount + newProductCount))
    };

    // Add warning if products were skipped due to limit
    if (products.length > productsToSync.length && plan === 'free') {
      const skippedCount = products.length - productsToSync.length;
      syncInfo.warning = `${skippedCount} products were not synced due to the Free plan limit of ${maxProducts} products. Upgrade to Professional to sync all products.`;
    }

    return NextResponse.json({
      success: true,
      products: productsList,
      count: productsList.length,
      syncInfo: syncInfo
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}