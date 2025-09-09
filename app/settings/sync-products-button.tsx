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
        let message = `Successfully synced ${data.count} products`;
        
        if (data.syncInfo) {
          if (data.syncInfo.newProductsSynced > 0) {
            message = `Synced ${data.syncInfo.newProductsSynced} new products and updated ${data.syncInfo.existingProductsUpdated} existing products`;
          } else {
            message = `Updated ${data.syncInfo.existingProductsUpdated} existing products`;
          }
          
          if (data.syncInfo.warning) {
            message += `. ${data.syncInfo.warning}`;
            setBannerError(false); // Use warning tone instead of error
          }
          
          message += `. (${data.syncInfo.currentTotalProducts}/${data.syncInfo.maxAllowed} products used on ${data.syncInfo.plan} plan)`;
        }
        
        setBannerMessage(message);
        setBannerError(false);
        setBannerActive(true);
        
        // Refresh the page to show updated products
        router.refresh();
        
        // Hide banner after 5 seconds for longer messages
        setTimeout(() => setBannerActive(false), data.syncInfo?.warning ? 5000 : 3000);
      } else {
        // Handle specific error cases
        if (response.status === 401 && data.requiresReauth) {
          setBannerMessage('Authentication failed. Please reinstall the app or contact support.');
        } else if (response.status === 403 && data.quotaFull) {
          // Handle quota full scenario with upgrade option
          const upgradeMessage = data.plan === 'free' 
            ? `${data.error}\n\nWould you like to upgrade to Professional now?`
            : data.error;
            
          if (data.plan === 'free' && confirm(upgradeMessage)) {
            // Redirect to billing page for upgrade
            const params = new URLSearchParams(window.location.search);
            const billingUrl = `/billing?${params.toString()}`;
            window.location.href = billingUrl;
            return;
          } else {
            setBannerMessage(data.error);
          }
        } else if (response.status === 403) {
          setBannerMessage(data.error || 'Permission denied. The app may not have the required permissions.');
        } else if (response.status === 429) {
          setBannerMessage('Too many requests. Please try again in a few moments.');
        } else {
          setBannerMessage(data.error || 'Failed to sync products');
        }
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