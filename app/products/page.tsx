import { requireAuth } from '@/lib/auth-check';
import { supabaseAdmin } from '@/lib/supabase';
import ProductsContent from './products-content';

async function getInitialProductsData(storeId: string) {
  // For initial load, just return empty array
  // The client component will fetch the data with pagination
  return [];
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
  
  const products = await getInitialProductsData(store.id);

  return (
    <ProductsContent 
      products={products}
      searchParams={params}
    />
  );
}