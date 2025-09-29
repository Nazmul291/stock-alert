import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const shop = searchParams.get('shop');

  if (!shop) {
    return NextResponse.json({ error: 'Missing shop parameter' }, { status: 400 });
  }

  try {
    // Get store from database
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', shop)
      .single();

    if (!store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const client = await getShopifyClient(shop, store.access_token);


    const testResults = {
      shop,
      grantedScopes: store.scope,
      tests: {
        readProducts: { attempted: false, success: false, error: null },
        readInventory: { attempted: false, success: false, error: null },
        writeProducts: { attempted: false, success: false, error: null },
      }
    };

    // Test 1: Try to READ products
    try {
      testResults.tests.readProducts.attempted = true;
      const productsResponse = await client.get({
        path: 'products.json',
        query: { limit: 1 }
      });
      testResults.tests.readProducts.success = true;
      testResults.tests.readProducts.data = {
        count: productsResponse.body.products?.length || 0,
        firstProduct: productsResponse.body.products?.[0]?.title
      };
    } catch (error: any) {
      testResults.tests.readProducts.error = error.message;
    }

    // Test 2: Try to READ inventory
    try {
      testResults.tests.readInventory.attempted = true;
      const inventoryResponse = await client.get({
        path: 'inventory_levels.json',
        query: { limit: 1 }
      });
      testResults.tests.readInventory.success = true;
      testResults.tests.readInventory.data = {
        count: inventoryResponse.body.inventory_levels?.length || 0
      };
    } catch (error: any) {
      testResults.tests.readInventory.error = error.message;
    }

    // Test 3: Check if we could write (but don't actually write)
    // Just check if the endpoint would be accessible
    testResults.tests.writeProducts.note = 'Write test skipped to avoid modifying data';

    // Summary
    const canReadProducts = testResults.tests.readProducts.success;
    const canReadInventory = testResults.tests.readInventory.success;

    testResults.summary = {
      canFunctionProperly: canReadProducts && canReadInventory,
      message: canReadProducts && canReadInventory
        ? '✅ App has sufficient permissions to function'
        : '❌ App lacks necessary read permissions',
      recommendations: []
    };

    if (!canReadProducts) {
      testResults.summary.recommendations.push('Need read_products or write_products scope');
    }
    if (!canReadInventory) {
      testResults.summary.recommendations.push('Need read_inventory or write_inventory scope');
    }

    return NextResponse.json(testResults, { status: 200 });

  } catch (error: any) {
    console.error('[Scope Test] Error:', error);
    return NextResponse.json({
      error: 'Test failed',
      message: error.message
    }, { status: 500 });
  }
}