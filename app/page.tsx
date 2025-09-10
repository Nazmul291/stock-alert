import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import DashboardClient from './dashboard/dashboard-client';

// Server Component - serves as both landing page and dashboard
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ 
    shop?: string; 
    embedded?: string;
    host?: string;
    id_token?: string;
    session?: string;
    timestamp?: string;
    locale?: string;
    hmac?: string;
  }>;
}) {
  // Await searchParams as required in Next.js 15
  const params = await searchParams;
  
  // Check if we're in embedded context (Shopify admin)
  const isEmbedded = params.embedded === '1' || params.host;
  
  // If embedded with shop param, show dashboard
  if (isEmbedded && params.shop) {
    // Check if store exists in database (has completed OAuth)
    const { data: store } = await supabaseAdmin
      .from('stores')
      .select('*')
      .eq('shop_domain', params.shop)
      .single();
    
    // If no store or no access token, need to complete OAuth
    if (!store || !store.access_token) {
      redirect(`/api/auth?shop=${params.shop}&embedded=1`);
    }
    
    // Fetch all dashboard data in parallel
    const [
      inventoryStats,
      setupProgress,
      storeSettings,
      recentAlerts
    ] = await Promise.all([
      getInventoryStats(store.id),
      getSetupProgress(store.id),
      getStoreSettings(store.id),
      getRecentAlerts(store.id)
    ]);
    
    // Return dashboard directly
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
  
  // Default landing page for non-embedded context
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Stock Alert</h1>
          <p className="text-lg text-gray-600 mb-8">
            Automated inventory management for Shopify stores
          </p>
          
          <div className="space-y-4">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-2">Get Started</h2>
              <p className="text-gray-600 mb-4">
                Install Stock Alert to start managing your inventory automatically
              </p>
              <a
                href="/install"
                className="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition"
              >
                Install Now
              </a>
              <p className="text-sm text-gray-500 mt-4">
                Or install from the Shopify App Store
              </p>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="font-semibold text-blue-900">Features</h3>
              <ul className="mt-2 text-sm text-blue-800 space-y-1">
                <li>✓ Auto-hide sold out products</li>
                <li>✓ Low stock alerts via email & Slack</li>
                <li>✓ Custom thresholds per product</li>
                <li>✓ Real-time inventory tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions for dashboard data
async function getInventoryStats(storeId: string) {
  try {
    // TODO: After migration, use: await supabaseAdmin.rpc('get_inventory_stats', { p_store_id: storeId })
    // For now, use separate queries until migration is applied
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
    return [];
  }
}