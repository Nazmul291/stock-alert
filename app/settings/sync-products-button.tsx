'use client';

import { useState } from 'react';
import { Button, Banner } from '@shopify/polaris';
import { useRouter } from 'next/navigation';

interface SyncProductsButtonProps {
  shop: string;
}

export default function SyncProductsButton({ shop }: SyncProductsButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [bannerActive, setBannerActive] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerError, setBannerError] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    if (!shop) return;
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`/api/products/sync?shop=${shop}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (response.ok) {
        setBannerMessage(`Successfully synced ${data.count} products from Shopify`);
        setBannerError(false);
        setBannerActive(true);
        
        // Refresh the page to show updated products
        router.refresh();
        
        // Hide banner after 3 seconds
        setTimeout(() => setBannerActive(false), 3000);
      } else {
        setBannerMessage(data.error || 'Failed to sync products');
        setBannerError(true);
        setBannerActive(true);
      }
    } catch (error) {
      setBannerMessage('Failed to sync products from Shopify');
      setBannerError(true);
      setBannerActive(true);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {bannerActive && (
        <div style={{ marginBottom: '12px' }}>
          <Banner
            tone={bannerError ? 'critical' : 'success'}
            onDismiss={() => setBannerActive(false)}
          >
            {bannerMessage}
          </Banner>
        </div>
      )}
      <Button
        onClick={handleSync}
        loading={isLoading}
        size="medium"
      >
        {isLoading ? 'Syncing...' : 'Sync Products from Shopify'}
      </Button>
    </div>
  );
}