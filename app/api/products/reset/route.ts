import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireSessionToken } from '@/lib/session-token';

export async function POST(req: NextRequest) {
  try {
    // Require valid session token for this destructive operation
    const authResult = await requireSessionToken(req);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized'
      }, { status: 401 });
    }

    const shopDomain = authResult.shopDomain!;

    // Get store from database
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('shop_domain', shopDomain)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }


    // Delete all inventory tracking data for this store
    const { error: inventoryError, count: deletedInventory } = await supabaseAdmin
      .from('inventory_tracking')
      .delete()
      .eq('store_id', store.id);

    if (inventoryError) {
      return NextResponse.json({ 
        error: 'Failed to reset inventory data',
        details: inventoryError.message 
      }, { status: 500 });
    }

    // Delete all product settings for this store
    const { error: settingsError, count: deletedSettings } = await supabaseAdmin
      .from('product_settings')
      .delete()
      .eq('store_id', store.id);

    if (settingsError) {
      return NextResponse.json({ 
        error: 'Failed to reset product settings',
        details: settingsError.message 
      }, { status: 500 });
    }

    // Delete all alert history for this store
    const { error: alertError, count: deletedAlerts } = await supabaseAdmin
      .from('alert_history')
      .delete()
      .eq('store_id', store.id);

    if (alertError) {
      // Not critical, continue
    }


    return NextResponse.json({
      success: true,
      message: 'Product data reset successfully',
      deleted: {
        inventory: deletedInventory || 0,
        settings: deletedSettings || 0,
        alerts: deletedAlerts || 0
      }
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET method to check current product count
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
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id, plan')
      .eq('shop_domain', shopDomain)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get current product count
    const { data: products, error: countError } = await supabaseAdmin
      .from('inventory_tracking')
      .select('product_id')
      .eq('store_id', store.id);

    if (countError) {
      return NextResponse.json({ error: 'Failed to count products' }, { status: 500 });
    }

    // Count distinct products
    const distinctProductIds = new Set(products?.map(p => p.product_id) || []);
    const productCount = distinctProductIds.size;

    // Count total variants
    const variantCount = products?.length || 0;

    return NextResponse.json({
      shop: shopDomain,
      plan: store.plan || 'free',
      productCount,
      variantCount,
      products: Array.from(distinctProductIds)
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}