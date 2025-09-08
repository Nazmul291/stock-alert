'use client';

// This component is now just a passthrough since we don't need
// loading states for SSR. It's kept for backwards compatibility
// but can be removed entirely in the future.
export default function PolarisReady({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return <>{children}</>;
}