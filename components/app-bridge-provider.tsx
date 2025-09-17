'use client';

import { createContext, useContext, Suspense } from 'react';
import AdminNavigation from './admin-navigation';
import { useAppBridge } from '@/hooks/useAppBridge';

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

export default function AppBridgeProvider({ children }: AppBridgeProviderProps) {
  const { appBridge, isReady } = useAppBridge();

  return (
    <AppBridgeContext.Provider value={{ appBridge, isReady }}>
      <Suspense fallback={null}>
        <AdminNavigation />
      </Suspense>
      {children}
    </AppBridgeContext.Provider>
  );
}