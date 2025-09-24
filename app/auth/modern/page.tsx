import { Suspense } from 'react';
import ModernAuth from '@/components/modern-auth';

/**
 * Modern Authentication Page
 * Uses session token exchange instead of legacy OAuth redirect
 */
export default function ModernAuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ModernAuth />
    </Suspense>
  );
}