'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

export default function ShopifyAppBridge() {
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const initAppBridge = async () => {
      const host = searchParams.get('host');
      const shop = searchParams.get('shop');
      
      // Only initialize if we have a host parameter (embedded context)
      if (!host || typeof window === 'undefined') return;
      
      try {
        // Wait for App Bridge to be available
        let attempts = 0;
        while (!window.shopify && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (!window.shopify || !window.shopify.app) {
          console.log('App Bridge not available');
          return;
        }
        
        // Initialize the app
        const app = window.shopify;
        
        // Create navigation links
        const links = [
          { label: 'Dashboard', destination: '/dashboard' },
          { label: 'Products', destination: '/products' },
          { label: 'Settings', destination: '/settings' },
          { label: 'Billing', destination: '/billing' },
        ];
        
        // Add query parameters to each link
        const navigationLinks = links.map(link => ({
          label: link.label,
          destination: `${link.destination}?shop=${shop}&host=${host}`,
        }));
        
        // Set navigation through App Bridge
        if (app.navigation) {
          app.navigation.set(navigationLinks);
        }
        
      } catch (error) {
        console.error('Error initializing App Bridge:', error);
      }
    };
    
    initAppBridge();
  }, [searchParams]);
  
  return null;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    shopify?: any;
  }
}