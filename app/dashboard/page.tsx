// Server Component - Fetches all data
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import DashboardClient from './dashboard-client';

interface SearchParams {
  shop?: string;
  embedded?: string;
  host?: string;
  id_token?: string;
  session?: string;
  timestamp?: string;
  locale?: string;
  hmac?: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  
  // Verify we have required params
  if (!params.shop) {
    redirect('/');
  }

  // Fetch store data
  const { data: store } = await supabaseAdmin
    .from('stores')
    .select('*')
    .eq('shop_domain', params.shop)
    .single();

  if (!store) {
    redirect(`/api/auth?shop=${params.shop}&embedded=1`);
  }

  // Fetch all dashboard data in parallel
  const [
    inventoryStats,
    setupProgress,
    storeSettings,
    recentAlerts
  ] = await Promise.all([
    // Get inventory statistics
    getInventoryStats(store.id),
    // Get setup progress
    getSetupProgress(store.id),
    // Get store settings
    getStoreSettings(store.id),
    // Get recent alerts
    getRecentAlerts(store.id)
  ]);

  // Pass all server-fetched data to client component
  return (
    <DashboardClient
      store={store}
      stats={inventoryStats}
      setupProgress={setupProgress}
      settings={storeSettings}
      recentAlerts={recentAlerts}
      searchParams={params}
    />
  );
}

async function getInventoryStats(storeId: string) {
  try {
    const [
      { count: totalProducts },
      { count: lowStock },
      { count: outOfStock },
      { count: hidden }
    ] = await Promise.all([
      supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId),
      
      supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .lt('current_quantity', 5)
        .gt('current_quantity', 0),
      
      supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('current_quantity', 0),
      
      supabaseAdmin
        .from('inventory_tracking')
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('is_hidden', true)
    ]);

    // Get today's alert count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { count: alertsToday } = await supabaseAdmin
      .from('alert_history')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .gte('sent_at', today.toISOString());

    return {
      totalProducts: totalProducts || 0,
      lowStock: lowStock || 0,
      outOfStock: outOfStock || 0,
      hidden: hidden || 0,
      alertsToday: alertsToday || 0
    };
  } catch (error) {
    console.error('Error fetching inventory stats:', error);
    return {
      totalProducts: 0,
      lowStock: 0,
      outOfStock: 0,
      hidden: 0,
      alertsToday: 0
    };
  }
}

async function getSetupProgress(storeId: string) {
  try {
    const { data: progress } = await supabaseAdmin
      .from('setup_progress')
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (!progress) {
      // Create initial progress
      const { data: newProgress } = await supabaseAdmin
        .from('setup_progress')
        .insert({
          store_id: storeId,
          app_installed: true,
          global_settings_configured: false,
          notifications_configured: false,
          product_thresholds_configured: false,
          first_product_tracked: false
        })
        .select()
        .single();
      
      return newProgress;
    }

    return progress;
  } catch (error) {
    console.error('Error fetching setup progress:', error);
    return null;
  }
}

async function getStoreSettings(storeId: string) {
  try {
    const { data: settings } = await supabaseAdmin
      .from('store_settings')
      .select('*')
      .eq('store_id', storeId)
      .single();

    return settings;
  } catch (error) {
    console.error('Error fetching store settings:', error);
    return null;
  }
}

async function getRecentAlerts(storeId: string) {
  try {
    const { data: alerts } = await supabaseAdmin
      .from('alert_history')
      .select('*')
      .eq('store_id', storeId)
      .order('sent_at', { ascending: false })
      .limit(5);

    return alerts || [];
  } catch (error) {
    console.error('Error fetching recent alerts:', error);
    return [];
  }
}