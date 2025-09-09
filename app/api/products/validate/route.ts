import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { validateProductLimit, getPlanLimits } from '@/lib/plan-limits';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop parameter is required' }, { status: 400 });
    }

    // Get store information
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id, plan')
      .eq('shop_domain', shop)
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
      console.error('Error counting products:', countError);
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
    console.error('Product validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { shop, productIds } = body;

    if (!shop || !productIds || !Array.isArray(productIds)) {
      return NextResponse.json({ 
        error: 'Shop and productIds array are required' 
      }, { status: 400 });
    }

    // Get store information
    const { data: store, error: storeError } = await supabaseAdmin
      .from('stores')
      .select('id, plan')
      .eq('shop_domain', shop)
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
    console.error('Product validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}