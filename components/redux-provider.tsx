'use client';

import { Provider } from 'react-redux';
import { store } from '@/store/store';
import { useEffect, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAppDispatch } from '@/store/hooks';
import { setAuth, setLoading } from '@/store/authSlice';
import { getSessionTokenFromURL } from '@/hooks/session-helpers';

function AuthInitializerInner({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const initStarted = useRef(false);

  useEffect(() => {
    // Prevent double initialization
    if (initStarted.current) return;
    initStarted.current = true;

    const initAuth = async () => {
      const shop = searchParams.get('shop');

      try {
        // Try to get session token from URL first (fastest method)
        const sessionToken = getSessionTokenFromURL();

        // Build headers for authentication
        const headers: HeadersInit = {
          'Content-Type': 'application/json',
        };

        // Add session token to Authorization header if available
        if (sessionToken) {
          headers['Authorization'] = `Bearer ${sessionToken}`;
        }

        // Build URL with shop parameter if available
        const verifyUrl = shop
          ? `/api/auth/verify?shop=${shop}`
          : '/api/auth/verify';

        // Only verify if we have either a session token or shop param
        if (sessionToken || shop) {
          const response = await fetch(verifyUrl, {
            method: 'GET',
            headers,
            credentials: 'include', // Include cookies if any
          });

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
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
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