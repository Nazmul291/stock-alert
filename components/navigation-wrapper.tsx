'use client';

import { Suspense } from 'react';
import AppNavigation from './app-navigation';

export default function NavigationWrapper() {
  return (
    <Suspense fallback={null}>
      <AppNavigation />
    </Suspense>
  );
}