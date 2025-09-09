import { requireAuth } from '@/lib/auth-check';
import { getStore, getStoreSettings } from '@/lib/auth-server';
import { supabaseAdmin } from '@/lib/supabase';
import SettingsContent from './settings-content';

// Server Component - fetches data on the server
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; host?: string; billing?: string }>;
}) {
  const params = await searchParams;
  
  // Require authentication with shop parameter
  const authStore = await requireAuth(params.shop);
  const store = await getStore(params.shop!);
  const settings = await getStoreSettings(authStore.id);
  
  // Fetch products (without settings for now)
  const { data: productsData, error: fetchError } = await supabaseAdmin
    .from('inventory_tracking')
    .select('*')
    .eq('store_id', authStore.id)
    .order('product_title', { ascending: true });

  if (fetchError) {
    console.error('Settings page - Error fetching products:', fetchError);
  }

  // Group by product
  console.log('Settings page - raw data from DB:', productsData?.length, productsData);
  const groupedProducts = productsData?.reduce((acc: any, item: any) => {
    const key = item.product_id;
    if (!acc[key]) {
      acc[key] = {
        product_id: item.product_id,
        product_title: item.product_title,
        variants: [],
        total_quantity: 0,
        settings: null,
      };
    }
    acc[key].variants.push(item);
    acc[key].total_quantity += item.current_quantity;
    return acc;
  }, {});

  const products = Object.values(groupedProducts || {});
  console.log('Settings page - products from DB:', products.length);
  
  // NO automatic sync - users must click the sync button manually

  return (
    <SettingsContent
      store={store}
      settings={settings || {
        auto_hide_enabled: true,
        auto_republish_enabled: false,
        low_stock_threshold: 5,
        email_notifications: true,
        slack_notifications: false,
        slack_webhook_url: '',
        notification_email: '',
      }}
      products={products}
      searchParams={params}
    />
  );
}