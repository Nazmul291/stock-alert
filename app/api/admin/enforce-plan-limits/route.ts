import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { enforcePlanLimits, handlePlanDowngrade, handlePlanUpgrade } from '@/lib/plan-enforcement';

// Admin endpoint to enforce plan limits
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get('shop');
    const action = searchParams.get('action'); // 'enforce', 'downgrade', 'upgrade'

    if (!shop) {
      return NextResponse.json({ error: 'Shop parameter required' }, { status: 400 });
    }

    // Get store
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, plan, shop_domain')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    let result;

    if (action === 'downgrade') {
      const newPlan = searchParams.get('plan') || 'free';
      result = await handlePlanDowngrade(store.id, newPlan);
    } else if (action === 'upgrade') {
      const newPlan = searchParams.get('plan') || 'pro';
      result = await handlePlanUpgrade(store.id, newPlan);
    } else {
      // Default: enforce current plan limits
      result = await enforcePlanLimits(store.id, store.plan);
    }

    return NextResponse.json({
      success: result.success,
      store: {
        id: store.id,
        shop: store.shop_domain,
        plan: store.plan
      },
      enforcement: result
    });

  } catch (error: any) {
    console.error('Plan enforcement error:', error);
    return NextResponse.json({
      error: 'Failed to enforce plan limits',
      details: error.message
    }, { status: 500 });
  }
}

// Get current plan status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop parameter required' }, { status: 400 });
    }

    // Get store and product counts
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id, plan, shop_domain')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    const [
      { count: activeCount },
      { count: deactivatedCount },
      { count: totalCount }
    ] = await Promise.all([
      supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .neq('inventory_status', 'deactivated'),

      supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
        .eq('inventory_status', 'deactivated'),

      supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', store.id)
    ]);

    return NextResponse.json({
      store: {
        id: store.id,
        shop: store.shop_domain,
        plan: store.plan
      },
      products: {
        active: activeCount || 0,
        deactivated: deactivatedCount || 0,
        total: totalCount || 0
      }
    });

  } catch (error: any) {
    console.error('Plan status error:', error);
    return NextResponse.json({
      error: 'Failed to get plan status',
      details: error.message
    }, { status: 500 });
  }
}