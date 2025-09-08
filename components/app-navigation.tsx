'use client';

import { NavMenu } from '@shopify/app-bridge-react';
import { useSearchParams } from 'next/navigation';

export default function AppNavigation() {
  const searchParams = useSearchParams();

  const getUrl = (path: string) => {
    const params = new URLSearchParams();
    const shop = searchParams.get('shop');
    const host = searchParams.get('host');
    if (shop) params.set('shop', shop);
    if (host) params.set('host', host);
    return `${path}?${params.toString()}`;
  };

  return (
    <NavMenu>
      <a href={getUrl('/')} rel="home">
        Stock Alert
      </a>
      <a href={getUrl('/dashboard')}>Dashboard</a>
      <a href={getUrl('/products')}>Products</a>
      <a href={getUrl('/settings')}>Settings</a>
      <a href={getUrl('/billing')}>Billing</a>
    </NavMenu>
  );
}