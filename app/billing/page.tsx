
import { requireAuth } from '@/lib/auth-check';
import { getStore } from '@/lib/auth-server';
import BillingContent from './billing-content';

// Server Component
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; host?: string }>;
}) {
  const params = await searchParams;
  
  // Require authentication with shop parameter
  await requireAuth(params.shop);
  const store = await getStore(params.shop!);

  return (
    <BillingContent 
      store={store}
      searchParams={params}
    />
  );
}