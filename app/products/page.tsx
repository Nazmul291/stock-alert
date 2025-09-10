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
    // Error fetching products - handled gracefully by returning empty array
  }
    
  // Return whatever is in the database (empty array if no products)
  return groupProducts(productsData);
}

function groupProducts(productsData: any) {
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
  
  // Require authentication with shop parameter
  const store = await requireAuth(params.shop);
  
  const products = await getProductsData(store.id);

  return (
    <ProductsContent 
      products={products}
      searchParams={params}
    />
  );
}