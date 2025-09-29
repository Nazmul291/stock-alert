'use client';

import { PropsWithChildren } from 'react';
import { NavMenu } from '@shopify/app-bridge-react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

/**
 * Shopify Provider - Handles App Bridge initialization and navigation
 * Based on Shopify's official recommendations for Next.js apps
 */
export function ShopifyProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Get required params
  const shop = searchParams.get('shop');
  const host = searchParams.get('host');

  // Don't render navigation on auth/install pages
  const isAuthPage = pathname === '/install' ||
                     pathname.startsWith('/api/auth') ||
                     pathname === '/auth-bounce';

  // Check if we're in an embedded context
  const isEmbedded = typeof window !== 'undefined' &&
                     window !== window.parent &&
                     shop &&
                     host;

  // Helper to create URLs with preserved params
  const createAppUrl = (path: string) => {
    const params = new URLSearchParams();
    if (shop) params.set('shop', shop);
    if (host) params.set('host', host);

    // Preserve session token if present
    const idToken = searchParams.get('id_token');
    if (idToken) params.set('id_token', idToken);

    return `${path}?${params.toString()}`;
  };

  return (
    <>
      {/* Only render NavMenu when embedded and not on auth pages */}
      {isEmbedded && !isAuthPage && (
        <NavMenu>
          {/* IMPORTANT: First item must have rel="home" - it configures but doesn't render */}
          <a href={createAppUrl('/')} rel="home">
            Home
          </a>
          <a href={createAppUrl('/products')}>Products</a>
          <a href={createAppUrl('/settings')}>Settings</a>
          <a href={createAppUrl('/billing')}>Billing</a>
          <a href={createAppUrl('/privacy')}>Privacy</a>
        </NavMenu>
      )}
      {children}
    </>
  );
}