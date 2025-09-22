'use client';

import { createContext, useContext, useEffect, useState, Suspense } from 'react';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';

interface AppBridgeContextType {
  appBridge: any;
  isReady: boolean;
}

const AppBridgeContext = createContext<AppBridgeContextType>({
  appBridge: null,
  isReady: false,
});

export const useAppBridgeContext = () => useContext(AppBridgeContext);

interface AppBridgeProviderProps {
  children: React.ReactNode;
}

function AppBridgeProviderInner({ children }: AppBridgeProviderProps) {
  const [appBridge, setAppBridge] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);
  const searchParams = useSearchParams();

  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  useEffect(() => {
    if (!host || typeof window === 'undefined') return;

    const initAppBridge = async () => {
      // Wait for Shopify App Bridge to be available
      let attempts = 0;
      while (!window.shopify && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      if (window.shopify) {
        // App Bridge is loaded from CDN, just use it
        setAppBridge(window.shopify);
        setIsReady(true);
      }
    };

    initAppBridge();
  }, [host]);

  // Helper to add query params to URLs
  const getUrl = (path: string) => {
    const params = new URLSearchParams();
    if (shop) params.set('shop', shop);
    if (host) params.set('host', host);
    const idToken = searchParams.get('id_token');
    if (idToken) params.set('id_token', idToken);
    return `${path}?${params.toString()}`;
  };

  return (
    <AppBridgeContext.Provider value={{ appBridge, isReady }}>
      {/* Only render NavMenu when App Bridge is ready and we're in embedded context */}
      {isReady && host && (
        <NavMenu>
          <a href={getUrl('/')} rel="home">Home</a>
          <a href={getUrl('/products')}>Products</a>
          <a href={getUrl('/settings')}>Settings</a>
          <a href={getUrl('/billing')}>Billing</a>
        </NavMenu>
      )}
      {children}
    </AppBridgeContext.Provider>
  );
}

export default function AppBridgeProvider({ children }: AppBridgeProviderProps) {
  return (
    <Suspense fallback={
      <AppBridgeContext.Provider value={{ appBridge: null, isReady: false }}>
        {children}
      </AppBridgeContext.Provider>
    }>
      <AppBridgeProviderInner>{children}</AppBridgeProviderInner>
    </Suspense>
  );
}

declare global {
  interface Window {
    shopify?: any;
  }
}