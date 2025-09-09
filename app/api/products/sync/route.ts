import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { PLAN_LIMITS } from '@/lib/plan-limits';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop parameter required' }, { status: 400 });
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
    
    // Count distinct products (not variants)
    const distinctProductIds = new Set(currentProducts?.map(p => p.product_id) || []);
    const currentProductCount = distinctProductIds.size;

    console.log(`Store ${shop} on ${plan} plan - Current products: ${currentProductCount}, Limit: ${maxProducts}`);

    // First, verify the access token is valid with a lightweight API call
    console.log(`Verifying token for ${shop}...`);
    const shopInfoResponse = await fetch(
      `https://${shop}/admin/api/2024-01/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!shopInfoResponse.ok) {
      console.error('Token validation failed:', {
        status: shopInfoResponse.status,
        shop: shop
      });
      
      if (shopInfoResponse.status === 401) {
        return NextResponse.json({ 
          error: 'Authentication failed. The access token is invalid or expired. Please reinstall the app.',
          requiresReauth: true 
        }, { status: 401 });
      }
    }

    // Fetch products from Shopify
    console.log(`Token valid. Fetching products from Shopify for ${shop}...`);
    
    const productsResponse = await fetch(
      `https://${shop}/admin/api/2024-01/products.json?limit=250`,
      {
        headers: {
          'X-Shopify-Access-Token': store.access_token,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!productsResponse.ok) {
      console.error('Failed to fetch products from Shopify:', {
        status: productsResponse.status,
        statusText: productsResponse.statusText,
        shop: shop,
        hasToken: !!store.access_token
      });
      
      // Handle specific error cases
      if (productsResponse.status === 401) {
        // Authentication error - token might be invalid or expired
        return NextResponse.json({ 
          error: 'Authentication failed. The app may need to be re-installed or re-authenticated.',
          requiresReauth: true 
        }, { status: 401 });
      } else if (productsResponse.status === 403) {
        // Permission error - app might not have required scopes
        return NextResponse.json({ 
          error: 'Permission denied. The app may not have the required permissions to access products.' 
        }, { status: 403 });
      } else if (productsResponse.status === 429) {
        // Rate limiting
        return NextResponse.json({ 
          error: 'Rate limit exceeded. Please try again in a few moments.' 
        }, { status: 429 });
      }
      
      // Generic error
      return NextResponse.json({ 
        error: `Failed to fetch products from Shopify (${productsResponse.status})` 
      }, { status: 500 });
    }

    const { products } = await productsResponse.json();
    console.log(`Fetched ${products.length} products from Shopify`);

    // We already have the distinct product IDs from above
    const existingProductIds = distinctProductIds;
    const existingProductCount = currentProductCount;

    // Calculate how many products we can sync based on plan limits
    const remainingSlots = Math.max(0, maxProducts - existingProductCount);
    
    if (remainingSlots === 0 && plan === 'free') {
      return NextResponse.json({ 
        error: `Product limit reached. You have already synced ${maxProducts} products on the Free plan. Please upgrade to Professional to sync more products.`,
        currentCount: existingProductCount,
        maxProducts: maxProducts,
        plan: plan
      }, { status: 403 });
    }

    // Process and store products in database
    const inventoryData = [];
    const productsToSync = [];
    let newProductCount = 0;

    // Filter products - prioritize new products up to the limit
    for (const product of products) {
      if (!existingProductIds.has(product.id)) {
        if (newProductCount < remainingSlots) {
          productsToSync.push(product);
          newProductCount++;
        }
      } else {
        // Always include already synced products for updates
        productsToSync.push(product);
      }
    }

    console.log(`Will sync ${productsToSync.length} products (${newProductCount} new, ${productsToSync.length - newProductCount} updates)`);
    
    for (const product of productsToSync) {
      for (const variant of product.variants) {
        inventoryData.push({
          store_id: store.id,
          product_id: product.id,
          variant_id: variant.id,
          product_title: product.title,
          variant_title: variant.title !== 'Default Title' ? variant.title : null,
          sku: variant.sku || null,
          current_quantity: variant.inventory_quantity || 0,
          previous_quantity: variant.inventory_quantity || 0,
          is_hidden: false,
          last_checked_at: new Date().toISOString(),
        });
      }
    }

    // Upsert inventory data
    if (inventoryData.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('inventory_tracking')
        .upsert(inventoryData.map(item => ({
          ...item,
          updated_at: new Date().toISOString()
        })), {
          onConflict: 'store_id,variant_id'
        });

      if (upsertError) {
        console.error('Error upserting inventory data:', upsertError);
        return NextResponse.json({ error: 'Failed to save inventory data' }, { status: 500 });
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
    console.error('Error in GET /api/products/sync:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}