import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyShopifySession } from '@/lib/auth-check';

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const shop = searchParams.get('shop');

    if (!shop) {
      return NextResponse.json({ error: 'Shop parameter required' }, { status: 400 });
    }

    // Verify the shop exists and get store ID
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Get or create setup progress
    let { data: progress, error } = await supabaseAdmin
      .from('setup_progress')
      .select('*')
      .eq('store_id', store.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // No progress record exists, create one
      const { data: newProgress, error: createError } = await supabaseAdmin
        .from('setup_progress')
        .insert({
          store_id: store.id,
          app_installed: true, // They're here, so app is installed
          global_settings_configured: false,
          notifications_configured: false,
          product_thresholds_configured: false,
          first_product_tracked: false
        })
        .select()
        .single();

      if (createError) {
        return NextResponse.json({ error: 'Failed to create setup progress' }, { status: 500 });
      }

      progress = newProgress;
    } else if (error) {
      return NextResponse.json({ error: 'Failed to fetch setup progress' }, { status: 500 });
    }

    // Also check if settings exist to update progress automatically
    const { data: settings } = await supabaseAdmin
      .from('store_settings')
      .select('*')
      .eq('store_id', store.id)
      .single();

    // Check if any products are being tracked
    const { count: productCount } = await supabaseAdmin
      .from('product_settings')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', store.id);

    // Update progress based on actual state
    const updates: any = {};
    let needsUpdate = false;

    if (settings) {
      // Check if global settings are configured (not default values)
      if (settings.low_stock_threshold !== 5 || settings.notification_email) {
        updates.global_settings_configured = true;
        needsUpdate = true;
      }

      // Check if notifications are configured
      if (settings.notification_email || settings.slack_webhook_url) {
        updates.notifications_configured = true;
        needsUpdate = true;
      }
    }

    // Check if product thresholds are configured
    if (productCount && productCount > 0) {
      updates.product_thresholds_configured = true;
      updates.first_product_tracked = true;
      needsUpdate = true;
    }

    // Update progress if needed
    if (needsUpdate && progress) {
      const { data: updatedProgress } = await supabaseAdmin
        .from('setup_progress')
        .update(updates)
        .eq('store_id', store.id)
        .select()
        .single();

      if (updatedProgress) {
        progress = { ...progress, ...updatedProgress };
      }
    }

    // Calculate overall progress percentage
    const steps = [
      'app_installed',
      'global_settings_configured', 
      'notifications_configured',
      'product_thresholds_configured'
    ];

    const completedSteps = steps.filter(step => progress && progress[step]).length;
    const progressPercentage = Math.round((completedSteps / steps.length) * 100);

    return NextResponse.json({
      progress,
      percentage: progressPercentage,
      completedSteps,
      totalSteps: steps.length
    });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const shop = searchParams.get('shop');
    const body = await req.json();

    if (!shop) {
      return NextResponse.json({ error: 'Shop parameter required' }, { status: 400 });
    }

    // Verify the shop exists and get store ID
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('id')
      .eq('shop_domain', shop)
      .single();

    if (!store) {
      return NextResponse.json({ error: 'Store not found' }, { status: 404 });
    }

    // Update setup progress
    const { data: progress, error } = await supabaseAdmin
      .from('setup_progress')
      .upsert({
        store_id: store.id,
        ...body,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'store_id'
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Failed to update setup progress' }, { status: 500 });
    }

    return NextResponse.json({ progress });

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}