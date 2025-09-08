'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

export default function AdminNavigation() {
  const searchParams = useSearchParams();
  const navRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const shop = searchParams.get('shop');
    const host = searchParams.get('host');
    
    // Only render navigation in embedded context
    if (!host || !navRef.current) return;
    
    const getUrl = (path: string) => {
      const params = new URLSearchParams();
      if (shop) params.set('shop', shop);
      if (host) params.set('host', host);
      return `${path}?${params.toString()}`;
    };
    
    // Create the ui-nav-menu web component
    const navMenu = document.createElement('ui-nav-menu');
    
    // Create navigation links
    const links = [
      { href: '/', label: 'Home', rel: 'home' },
      { href: '/products', label: 'Products' },
      { href: '/settings', label: 'Settings' },
      { href: '/billing', label: 'Billing' },
    ];
    
    links.forEach(link => {
      const anchor = document.createElement('a');
      anchor.href = getUrl(link.href);
      anchor.textContent = link.label;
      if (link.rel) {
        anchor.rel = link.rel;
      }
      navMenu.appendChild(anchor);
    });
    
    // Add to DOM
    navRef.current.appendChild(navMenu);
    
    // Cleanup
    return () => {
      if (navRef.current && navMenu.parentNode) {
        navRef.current.removeChild(navMenu);
      }
    };
  }, [searchParams]);
  
  return <div ref={navRef} style={{ display: 'none' }} />;
}