'use client';

import { useAuth } from '@/hooks/useAuth';
import { Spinner } from '@shopify/polaris';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export default function AuthGuard({ children, requireAuth = true }: AuthGuardProps) {
  const { isLoading, isAuthenticated } = useAuth(requireAuth);
  
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh' 
      }}>
        <Spinner accessibilityLabel="Loading" size="large" />
      </div>
    );
  }
  
  if (requireAuth && !isAuthenticated) {
    return null; // Will redirect via useAuth hook
  }
  
  return <>{children}</>;
}