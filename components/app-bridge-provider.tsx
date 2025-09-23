'use client';

import { Suspense } from 'react';
import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';

interface AppBridgeProviderProps {
  children: React.ReactNode;
}

function AppBridgeProviderInner({ children }: AppBridgeProviderProps) {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

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
    <>
      {/* App Bridge v4 NavMenu - works without provider */}
      {host && (
        <NavMenu>
          <a href={getUrl('/')} rel="home">Home</a>
          <a href={getUrl('/products')}>Products</a>
          <a href={getUrl('/settings')}>Settings</a>
          <a href={getUrl('/billing')}>Billing</a>
        </NavMenu>
      )}
      {children}
    </>
  );
}

export default function AppBridgeProvider({ children }: AppBridgeProviderProps) {
  return (
    <Suspense fallback={<>{children}</>}>
      <AppBridgeProviderInner>{children}</AppBridgeProviderInner>
    </Suspense>
  );
}

// App Bridge v4 provides direct access via window.shopify
export function useAppBridge() {
  return {
    appBridge: typeof window !== 'undefined' ? window.shopify : null,
    isReady: typeof window !== 'undefined' && !!window.shopify
  };
}

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
      createApp?: (config: any) => any;
      [key: string]: any;
    };
  }
}