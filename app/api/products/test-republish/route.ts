import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { productId, shop } = await req.json();

    if (!productId || !shop) {
      return NextResponse.json({ error: 'Product ID and shop required' }, { status: 400 });
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

    const client = await getShopifyClient(shop, store.access_token);

    console.log(`[TEST-REPUBLISH] Testing republish for product ${productId}`);

    // First, get the current product status
    const getResponse = await client.get({
      path: `products/${productId}.json`,
      query: {
        fields: 'id,title,status'
      }
    });

    const currentProduct = getResponse.body.product;
    console.log(`[TEST-REPUBLISH] Current product status:`, currentProduct);

    // Try to update to active
    try {
      const updateResponse = await client.put({
        path: `products/${productId}.json`,
        data: {
          product: {
            id: parseInt(productId),
            status: 'active',
          },
        },
      });

      console.log(`[TEST-REPUBLISH] Update response:`, updateResponse.body);

      // Update database
      await supabaseAdmin
        .from('inventory_tracking')
        .update({ is_hidden: false })
        .eq('store_id', store.id)
        .eq('product_id', productId);

      return NextResponse.json({
        success: true,
        message: 'Product republished successfully',
        previousStatus: currentProduct.status,
        newStatus: 'active',
        product: updateResponse.body.product,
      });
    } catch (error: any) {
      console.error(`[TEST-REPUBLISH] Error:`, error);
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error.response?.body,
        status: error.response?.status,
      }, { status: 500 });
    }
  } catch (error) {
    console.error('[TEST-REPUBLISH] General error:', error);
    return NextResponse.json({ error: 'Failed to test republish' }, { status: 500 });
  }
}