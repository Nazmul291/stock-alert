'use client';

import { Suspense } from 'react';
import AdminNavigation from './admin-navigation';

interface AppBridgeProviderProps {
  children: React.ReactNode;
}

export default function AppBridgeProvider({ children }: AppBridgeProviderProps) {
  return (
    <>
      <Suspense fallback={null}>
        <AdminNavigation />
      </Suspense>
      {children}
    </>
  );
}