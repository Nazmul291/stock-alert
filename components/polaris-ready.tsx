'use client';

import { useEffect, useState } from 'react';

export default function PolarisReady({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Small delay to ensure AppProvider is mounted
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 0);
    
    return () => clearTimeout(timer);
  }, []);

  if (!isReady) {
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

  return <>{children}</>;
}