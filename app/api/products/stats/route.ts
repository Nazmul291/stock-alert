import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getSessionTokenFromRequest, getShopFromToken } from '@/lib/session-token';

export async function GET(req: NextRequest) {
  try {
    // Get shop from session token or query param
    let shop: string | null = null;
    const sessionToken = await getSessionTokenFromRequest(req);
    if (sessionToken) {
      shop = getShopFromToken(sessionToken);
    } else {
      shop = req.nextUrl.searchParams.get('shop');
    }

    if (!shop) {
      return NextResponse.json({ error: 'Shop not identified' }, { status: 400 });
    }

    // Get store from database
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, plan')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get all products for this store
    const { data: products, error } = await supabaseAdmin
      .from('inventory_tracking')
      .select('product_id, current_quantity, is_hidden')
      .eq('store_id', store.id);

    if (error) {
      throw error;
    }

    // Get store settings for threshold
    const { data: settings } = await supabaseAdmin
      .from('store_settings')
      .select('low_stock_threshold')
      .eq('store_id', store.id)
      .single();

    const threshold = settings?.low_stock_threshold || 5;

    // Calculate statistics
    const stats = {
      totalProducts: products?.length || 0,
      outOfStock: 0,
      lowStock: 0,
      inStock: 0,
      hidden: 0,
      active: 0,
      plan: store.plan || 'free',
      threshold: threshold
    };

    if (products && products.length > 0) {
      products.forEach(product => {
        // Stock levels
        if (product.current_quantity === 0) {
          stats.outOfStock++;
        } else if (product.current_quantity <= threshold) {
          stats.lowStock++;
        } else {
          stats.inStock++;
        }

        // Visibility status
        if (product.is_hidden) {
          stats.hidden++;
        } else {
          stats.active++;
        }
      });
    }

    // Calculate percentages
    const total = stats.totalProducts || 1; // Avoid division by zero
    const percentages = {
      outOfStock: Math.round((stats.outOfStock / total) * 100),
      lowStock: Math.round((stats.lowStock / total) * 100),
      inStock: Math.round((stats.inStock / total) * 100),
      hidden: Math.round((stats.hidden / total) * 100),
      active: Math.round((stats.active / total) * 100)
    };

    return NextResponse.json({
      stats,
      percentages,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching product stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}