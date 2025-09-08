'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppSelector } from '@/store/hooks';

export function useAuth(requireAuth: boolean = true) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, shop } = useAppSelector((state) => state.auth);
  
  useEffect(() => {
    if (!isLoading && requireAuth && !isAuthenticated) {
      const shopParam = searchParams.get('shop');
      
      if (shopParam) {
        // Redirect to OAuth
        router.push(`/api/auth?shop=${shopParam}&embedded=1`);
      } else {
        // No shop parameter, can't authenticate
        router.push('/');
      }
    }
  }, [isAuthenticated, isLoading, requireAuth, router, searchParams]);
  
  return {
    isAuthenticated,
    isLoading,
    shop,
  };
}