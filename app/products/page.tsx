import { requireAuth } from '@/lib/auth-check';
import { supabaseAdmin } from '@/lib/supabase';
import ProductsContent from './products-content';

async function getProductsData(storeId: string, shop: string, accessToken: string) {
  // Get products (without settings for now)
  const { data: productsData, error: fetchError } = await supabaseAdmin
    .from('inventory_tracking')
    .select('*')
    .eq('store_id', storeId)
    .order('product_title', { ascending: true });

  if (fetchError) {
    console.error('Products page - Error fetching products:', fetchError);
  }
    
  // If no products, sync from Shopify
  if (!productsData || productsData.length === 0) {
    console.log('No products in database, syncing from Shopify...');
    
    try {
      // Fetch products from Shopify
      const productsResponse = await fetch(
        `https://${shop}/admin/api/2024-01/products.json?limit=250`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json',
          },
        }
      );

      if (productsResponse.ok) {
        const { products } = await productsResponse.json();
        console.log(`Fetched ${products.length} products from Shopify`);

        // Process and store products
        const inventoryData = [];
        for (const product of products) {
          for (const variant of product.variants) {
            inventoryData.push({
              store_id: storeId,
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

        // Upsert inventory data
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
            console.error('Error upserting inventory data:', upsertError);
          } else {
            console.log('Successfully upserted inventory data:', inventoryData.length);
          }
          
          // Fetch again after inserting
          const { data: newProductsData, error: refetchError } = await supabaseAdmin
            .from('inventory_tracking')
            .select('*')
            .eq('store_id', storeId)
            .order('product_title', { ascending: true });

          if (refetchError) {
            console.error('Products page - Error refetching products:', refetchError);
          } else {
            console.log('Products page - Refetched products count:', newProductsData?.length);
          }
          
          return groupProducts(newProductsData);
        }
      }
    } catch (error) {
      console.error('Error syncing products from Shopify:', error);
    }
  }
    
  return groupProducts(productsData);
}

function groupProducts(productsData: any) {
  console.log('Products page - raw data from DB:', productsData?.length, productsData);
  // Group by product
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

  return Object.values(groupedProducts || {});
}

// Server Component
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; host?: string }>;
}) {
  const params = await searchParams;
  
  console.log('Products page - params:', params);
  
  // Require authentication with shop parameter
  const store = await requireAuth(params.shop);
  console.log('Products page - authenticated store:', store.id);
  
  const products = await getProductsData(store.id, params.shop!, store.access_token);
  console.log('Products page - fetched products:', products.length);

  return (
    <ProductsContent 
      products={products}
      searchParams={params}
    />
  );
}