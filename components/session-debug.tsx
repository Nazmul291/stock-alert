'use client';

import { useEffect } from 'react';
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch';

export default function SessionDebug() {
  const authenticatedFetch = useAuthenticatedFetch();

  useEffect(() => {
    // Make a session token request every 30 seconds to ensure Shopify can detect it
    const interval = setInterval(async () => {
      try {
        await authenticatedFetch('/api/session-check');
      } catch (error) {
        // Silent fail
      }
    }, 30000);

    // Make initial request
    authenticatedFetch('/api/session-check').catch(() => {});

    return () => clearInterval(interval);
  }, [authenticatedFetch]);

  return null; // This component doesn't render anything
}