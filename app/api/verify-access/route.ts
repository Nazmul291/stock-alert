import { NextRequest, NextResponse } from 'next/server';
import { getShopifyClient } from '@/lib/shopify';
import { supabaseAdmin } from '@/lib/supabase';
import { requireSessionToken } from '@/lib/session-token';

/**
 * Verifies actual API access after installation
 * Tests if we can read products and inventory regardless of scope names
 */
export async function GET(req: NextRequest) {
  try {
    // Require valid session token
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized'
      }, { status: 401 });
    }

    const shopDomain = authResult.shopDomain!;

    // Get store from database
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', shopDomain)
      .single();

    if (!store || !store.access_token) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const client = await getShopifyClient(shopDomain, store.access_token);

    // Test actual API access
    const accessTests = {
      shop: shopDomain,
      grantedScopes: store.scope || '',
      scopeWarning: store.scope_warning || null,
      actualAccess: {
        canReadProducts: false,
        canWriteProducts: false,
        canReadInventory: false,
        canWriteInventory: false,
      },
      apiTests: {} as Record<string, any>,
      recommendation: '',
      canFunction: false
    };

    // Test 1: Can we read products?
    try {
      const productsResponse = await client.get({
        path: 'products.json',
        query: { limit: 1 }
      });

      accessTests.actualAccess.canReadProducts = true;
      accessTests.apiTests.readProducts = {
        success: true,
        message: `Successfully read ${productsResponse.body.products?.length || 0} products`
      };
    } catch (error: any) {
      accessTests.apiTests.readProducts = {
        success: false,
        error: error.message || 'Cannot read products'
      };
    }

    // Test 2: Can we read inventory?
    try {
      const inventoryResponse = await client.get({
        path: 'inventory_levels.json',
        query: { limit: 1 }
      });

      accessTests.actualAccess.canReadInventory = true;
      accessTests.apiTests.readInventory = {
        success: true,
        message: `Successfully read ${inventoryResponse.body.inventory_levels?.length || 0} inventory levels`
      };
    } catch (error: any) {
      accessTests.apiTests.readInventory = {
        success: false,
        error: error.message || 'Cannot read inventory'
      };
    }

    // Test 3: Can we read a single product (different endpoint)?
    if (!accessTests.actualAccess.canReadProducts) {
      try {
        const productCountResponse = await client.get({
          path: 'products/count.json'
        });

        if (productCountResponse.body.count !== undefined) {
          accessTests.actualAccess.canReadProducts = true;
          accessTests.apiTests.productCount = {
            success: true,
            count: productCountResponse.body.count
          };
        }
      } catch (error: any) {
        accessTests.apiTests.productCount = {
          success: false,
          error: error.message
        };
      }
    }

    // Determine if app can function
    accessTests.canFunction =
      accessTests.actualAccess.canReadProducts &&
      accessTests.actualAccess.canReadInventory;

    // Check write permissions (based on granted scopes)
    const grantedScopes = store.scope?.split(',') || [];
    accessTests.actualAccess.canWriteProducts = grantedScopes.includes('write_products');
    accessTests.actualAccess.canWriteInventory = grantedScopes.includes('write_inventory');

    // Log actual granted scopes for debugging

    // Generate recommendation
    if (accessTests.canFunction) {
      accessTests.recommendation = '✅ App has sufficient permissions to function';

      // Update store to clear any warnings if access is verified
      await supabaseAdmin
        .from('stores')
        .update({
          scope_warning: null,
          verified_at: new Date().toISOString()
        })
        .eq('id', store.id);
    } else {
      const missing = [];
      if (!accessTests.actualAccess.canReadProducts) missing.push('read_products');
      if (!accessTests.actualAccess.canReadInventory) missing.push('read_inventory');

      accessTests.recommendation = `❌ App cannot function. Missing access to: ${missing.join(', ')}. Please reinstall the app.`;

      // Update store with verification failure
      await supabaseAdmin
        .from('stores')
        .update({
          scope_warning: `Missing access: ${missing.join(', ')}. Verified at ${new Date().toISOString()}`,
          verified_at: new Date().toISOString()
        })
        .eq('id', store.id);
    }

    // Log verification results

    return NextResponse.json(accessTests, {
      status: accessTests.canFunction ? 200 : 206 // 206 = Partial Content
    });

  } catch (error: any) {
    console.error('[Access Verification] Error:', error);
    return NextResponse.json({
      error: 'Verification failed',
      message: error.message
    }, { status: 500 });
  }
}