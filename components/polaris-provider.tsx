'use client';

import { AppProvider } from '@shopify/polaris';
import translations from '@shopify/polaris/locales/en.json';
import { useEffect, useState } from 'react';

export default function PolarisProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading state while mounting to prevent Polaris components from rendering without provider
  if (!mounted) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f6f6f7'
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <AppProvider i18n={translations}>
      {children}
    </AppProvider>
  );
}