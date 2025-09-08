'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ShopifyNavigation() {
  const searchParams = useSearchParams();
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).shopifyApp) {
      const app = (window as any).shopifyApp;
      
      // Use the Navigation API directly
      const navigation = app.navigation;
      
      // Set up navigation items
      const getUrl = (path: string) => {
        const params = new URLSearchParams();
        if (shop) params.set('shop', shop);
        if (host) params.set('host', host);
        return `${path}?${params.toString()}`;
      };

      // Create navigation menu
      navigation.create(app, {
        items: [
          {
            label: 'Dashboard',
            destination: getUrl('/dashboard'),
          },
          {
            label: 'Products',
            destination: getUrl('/products'),
          },
          {
            label: 'Settings',
            destination: getUrl('/settings'),
          },
          {
            label: 'Billing',
            destination: getUrl('/billing'),
          },
        ],
      });
    }
  }, [shop, host]);

  return null;
}