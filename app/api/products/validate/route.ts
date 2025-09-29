import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateProductLimit, getPlanLimits } from '@/lib/plan-limits';
import { requireSessionToken } from '@/lib/session-token';

export async function GET(request: NextRequest) {
  try {
    // Require valid session token
    const authResult = await requireSessionToken(request);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized'
      }, { status: 401 });
    }

    const shopDomain = authResult.shopDomain!;

    // Get store information
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id, plan')
      .eq('shop_domain', shopDomain)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get current tracked products for this store
    const { data: products, error: countError } = await supabaseAdmin
      .from('inventory_tracking')
      .select('product_id')
      .eq('store_id', store.id);

    if (countError) {
      return NextResponse.json({ error: 'Failed to count products' }, { status: 500 });
    }

    // Count distinct products (not variants)
    const distinctProductIds = new Set(products?.map(p => p.product_id) || []);
    const productCount = distinctProductIds.size;

    // Validate against plan limits
    const validation = validateProductLimit(store.plan || 'free', productCount || 0);
    const planLimits = getPlanLimits(store.plan || 'free');

    return NextResponse.json({
      store: {
        plan: store.plan || 'free',
        ...planLimits
      },
      validation,
      stats: {
        currentProducts: productCount || 0,
        maxProducts: planLimits.maxProducts,
        remainingSlots: Math.max(0, planLimits.maxProducts - (productCount || 0))
      }
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Require valid session token
    const authResult = await requireSessionToken(request);

    if (!authResult.isAuthenticated) {
      return NextResponse.json({
        error: authResult.error || 'Unauthorized'
      }, { status: 401 });
    }

    const shopDomain = authResult.shopDomain!;
    const body = await request.json();
    const { productIds } = body;

    if (!productIds || !Array.isArray(productIds)) {
      return NextResponse.json({
        error: 'productIds array is required'
      }, { status: 400 });
    }

    // Get store information
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id, plan')
      .eq('shop_domain', shopDomain)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get current tracked products
    const { data: currentProducts, error: countError } = await supabaseAdmin
      .from('inventory_tracking')
      .select('product_id')
      .eq('store_id', store.id);

    if (countError) {
      return NextResponse.json({ error: 'Failed to count products' }, { status: 500 });
    }

    // Count distinct products (not variants)
    const distinctCurrentProducts = new Set(currentProducts?.map(p => p.product_id) || []);
    const currentCount = distinctCurrentProducts.size;

    const planLimits = getPlanLimits(store.plan || 'free');
    const newTotal = (currentCount || 0) + productIds.length;
    
    // Check if adding these products would exceed the limit
    const canAdd = newTotal <= planLimits.maxProducts;
    const exceededBy = Math.max(0, newTotal - planLimits.maxProducts);

    return NextResponse.json({
      canAdd,
      currentCount: currentCount || 0,
      newCount: productIds.length,
      projectedTotal: newTotal,
      maxProducts: planLimits.maxProducts,
      exceededBy,
      plan: store.plan || 'free',
      message: canAdd 
        ? `Can add ${productIds.length} products` 
        : `Cannot add ${productIds.length} products. Would exceed limit by ${exceededBy} products. Current: ${currentCount}, Max: ${planLimits.maxProducts}`
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}