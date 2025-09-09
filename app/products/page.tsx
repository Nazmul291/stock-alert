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

        // Process and store products - PRODUCT-LEVEL TRACKING
        const inventoryData = [];
        for (const product of products) {
          // Calculate total quantity across all variants
          let totalQuantity = 0;
          const skus = [];
          
          for (const variant of product.variants) {
            totalQuantity += variant.inventory_quantity || 0;
            if (variant.sku) skus.push(variant.sku);
          }
          
          inventoryData.push({
            store_id: storeId,
            product_id: product.id,
            product_title: product.title,
            variant_title: null, // Not tracking individual variants
            sku: skus.join(', ') || null,
            current_quantity: totalQuantity,
            previous_quantity: totalQuantity,
            is_hidden: false,
            last_checked_at: new Date().toISOString(),
          });
        }

        // Upsert inventory data - handle both insert and update
        if (inventoryData.length > 0) {
          for (const item of inventoryData) {
            // Check if product already exists
            const { data: existing } = await supabaseAdmin
              .from('inventory_tracking')
              .select('id')
              .eq('store_id', item.store_id)
              .eq('product_id', item.product_id)
              .single();

            if (existing) {
              // Update existing record
              const { error: updateError } = await supabaseAdmin
                .from('inventory_tracking')
                .update({
                  ...item,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);

              if (updateError) {
                console.error('Error updating inventory data:', updateError);
              }
            } else {
              // Insert new record
              const { error: insertError } = await supabaseAdmin
                .from('inventory_tracking')
                .insert({
                  ...item,
                  updated_at: new Date().toISOString()
                });

              if (insertError) {
                console.error('Error inserting inventory data:', insertError);
              }
            }
          }
          console.log('Successfully processed inventory data:', inventoryData.length);
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
    } catch (error) {
      console.error('Error syncing products from Shopify:', error);
    }
  }
    
  return groupProducts(productsData);
}

function groupProducts(productsData: any) {
  console.log('Products page - raw data from DB:', productsData?.length, productsData);
  // Since we're now storing product-level data, no grouping needed
  // Just transform the data for the client component
  return productsData?.map((item: any) => ({
    product_id: item.product_id,
    product_title: item.product_title,
    variants: [item], // Keep single item as array for compatibility
    total_quantity: item.current_quantity,
    settings: null,
  })) || [];
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