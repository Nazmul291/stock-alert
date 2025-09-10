'use client';

import { Provider } from 'react-redux';
import { store } from '@/store/store';
import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { setAuth, setLoading } from '@/store/authSlice';

function AuthInitializerInner({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const initAuth = async () => {
      const shop = searchParams.get('shop');
      
      if (!shop) {
        dispatch(setLoading(false));
        return;
      }
      
      try {
        // Check if store exists in database
        const response = await fetch(`/api/auth/verify?shop=${shop}`);
        
        if (response.ok) {
          const data = await response.json();
          
          if (data.authenticated) {
            dispatch(setAuth({
              shop: data.shop,
              accessToken: data.hasToken ? 'stored' : null, // Don't expose actual token to client
              storeId: data.storeId,
              plan: data.plan,
            }));
          }
        }
      } catch (error) {
        // Auth initialization error handling preserved
      } finally {
        dispatch(setLoading(false));
      }
    };
    
    initAuth();
  }, [dispatch, searchParams]);
  
  return <>{children}</>;
}

function AuthInitializer({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AuthInitializerInner>
        {children}
      </AuthInitializerInner>
    </Suspense>
  );
}

export default function ReduxProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AuthInitializer>
        {children}
      </AuthInitializer>
    </Provider>
  );
}