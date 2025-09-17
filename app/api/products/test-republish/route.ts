import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient, getGraphQLClient } from '@/lib/shopify';
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

    const graphqlClient = await getGraphQLClient(shop, store.access_token);
    const productGID = `gid://shopify/Product/${productId}`;

    console.log(`[TEST-REPUBLISH] Testing republish for product ${productId}`);

    // First, get the current product status using GraphQL
    const getProductQuery = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          status
        }
      }`;

    const getResponse = await graphqlClient.request(getProductQuery, {
      variables: {
        id: productGID
      }
    });

    const currentProduct = getResponse?.data?.product;
    if (!currentProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    console.log(`[TEST-REPUBLISH] Current product status:`, currentProduct);

    // Try to update to active using GraphQL
    try {
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

      console.log(`[TEST-REPUBLISH] Update response:`, updateResponse.data?.productUpdate?.product);

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
        newStatus: 'ACTIVE',
        product: updateResponse.data?.productUpdate?.product,
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