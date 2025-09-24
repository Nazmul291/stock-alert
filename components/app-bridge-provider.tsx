'use client';

import { useEffect, useState } from 'react';

// This file now only exports the hook since navigation is handled by ShopifyProvider
// Following Shopify's recommended architecture

// Hook to access App Bridge
export function useAppBridge() {
  const [appBridge, setAppBridge] = useState<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const bridge = window.shopify || window.ShopifyBridge;
      if (bridge) {
        setAppBridge(bridge);
        setIsReady(true);
      }
    }
  }, []);

  return { appBridge, isReady };
}

// Empty default export for backward compatibility
export default function AppBridgeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

declare global {
  interface Window {
    shopify?: {
      idToken?: () => Promise<string>;
      createApp?: (config: any) => any;
      [key: string]: any;
    };
    ShopifyBridge?: {
      getSessionToken?: () => Promise<string>;
      createApp?: (config: any) => any;
      [key: string]: any;
    };
  }
}