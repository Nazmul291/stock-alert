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
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, access_token')
      .eq('shop_domain', shop)
      .single();

    if (!store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found or not authenticated' }, { status: 404 });
    }

    // Fetch products from Shopify
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
      console.error('Failed to fetch products from Shopify:', productsResponse.status);
      return NextResponse.json({ error: 'Failed to fetch products from Shopify' }, { status: 500 });
    }

    const { products } = await productsResponse.json();
    console.log(`Fetched ${products.length} products from Shopify`);

    // Process and store products in database
    const inventoryData = [];
    
    for (const product of products) {
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

    return NextResponse.json({
      success: true,
      products: productsList,
      count: productsList.length
    });

  } catch (error) {
    console.error('Error in GET /api/products/sync:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}