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
  
  // If no products, try to sync from Shopify
  if (products.length === 0) {
    try {
      const productsResponse = await fetch(
        `https://${params.shop}/admin/api/2024-01/products.json?limit=250`,
        {
          headers: {
            'X-Shopify-Access-Token': authStore.access_token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (productsResponse.ok) {
        const { products: shopifyProducts } = await productsResponse.json();
        
        const inventoryData = [];
        for (const product of shopifyProducts) {
          for (const variant of product.variants) {
            inventoryData.push({
              store_id: authStore.id,
              product_id: product.id,
              variant_id: variant.id,
              product_title: product.title,
              variant_title: variant.title !== 'Default Title' ? variant.title : null,
              sku: variant.sku || null,
              current_quantity: variant.inventory_quantity || 0,
              previous_quantity: variant.inventory_quantity || 0,
              is_hidden: false,
              last_checked_at: new Date().toISOString(),
            });
          }
        }

        if (inventoryData.length > 0) {
          const { error: upsertError } = await supabaseAdmin
            .from('inventory_tracking')
            .upsert(inventoryData.map(item => ({
              ...item,
              updated_at: new Date().toISOString()
            })), {
              onConflict: 'store_id,variant_id'
            });

          if (upsertError) {
            console.error('Settings page - Error upserting inventory data:', upsertError);
          } else {
            console.log('Settings page - Successfully upserted inventory data:', inventoryData.length);
          }
          
          // Re-fetch products after syncing
          const { data: newProductsData, error: refetchError } = await supabaseAdmin
            .from('inventory_tracking')
            .select('*')
            .eq('store_id', authStore.id)
            .order('product_title', { ascending: true });

          if (refetchError) {
            console.error('Settings page - Error refetching products:', refetchError);
          } else {
            console.log('Settings page - Refetched products count:', newProductsData?.length);
          }

          const newGroupedProducts = newProductsData?.reduce((acc: any, item: any) => {
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

          Object.assign(products, Object.values(newGroupedProducts || {}));
        }
      }
    } catch (error) {
      console.error('Error syncing products from Shopify:', error);
    }
  }

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