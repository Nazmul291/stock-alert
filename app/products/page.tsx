import { requireAuth } from '@/lib/auth-check';
import { supabaseAdmin } from '@/lib/supabase';
import ProductsContent from './products-content';

async function getProductsData(storeId: string) {
  // Get products from database only - no automatic syncing
  const { data: productsData, error: fetchError } = await supabaseAdmin
    .from('inventory_tracking')
    .select('*')
    .eq('store_id', storeId)
    .order('product_title', { ascending: true });

  if (fetchError) {
    console.error('Products page - Error fetching products:', fetchError);
  }
    
  // Return whatever is in the database (empty array if no products)
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
  
  const products = await getProductsData(store.id);
  console.log('Products page - fetched products:', products.length);

  return (
    <ProductsContent 
      products={products}
      searchParams={params}
    />
  );
}