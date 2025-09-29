import { Suspense } from 'react';
import SessionAuth from '@/components/session-auth';

/**
 * Session Token Authentication Page
 * Uses the existing App Bridge setup but authenticates with session tokens
 */
export default function SessionAuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SessionAuth />
    </Suspense>
  );
}