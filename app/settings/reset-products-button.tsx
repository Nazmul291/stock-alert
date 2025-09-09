'use client';

import { useState } from 'react';
import { Button, Banner, Modal, TextContainer } from '@shopify/polaris';
import { useRouter } from 'next/navigation';

interface ResetProductsButtonProps {
  shop: string;
}

export default function ResetProductsButton({ shop }: ResetProductsButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [modalActive, setModalActive] = useState(false);
  const [bannerActive, setBannerActive] = useState(false);
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerError, setBannerError] = useState(false);
  const router = useRouter();

  const handleModalChange = () => setModalActive(!modalActive);

  const handleReset = async () => {
    if (!shop) return;
    
    setIsLoading(true);
    setModalActive(false);
    
    try {
      const response = await fetch(`/api/products/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ shop }),
      });

      const data = await response.json();

      if (response.ok) {
        setBannerMessage(
          `Successfully reset product data. Deleted ${data.deleted.inventory} product records.`
        );
        setBannerError(false);
        setBannerActive(true);
        
        // Refresh the page to show updated state
        router.refresh();
        
        // Hide banner after 3 seconds
        setTimeout(() => setBannerActive(false), 3000);
      } else {
        setBannerMessage(data.error || 'Failed to reset product data');
        setBannerError(true);
        setBannerActive(true);
      }
    } catch (error) {
      setBannerMessage('Failed to reset product data');
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
        onClick={handleModalChange}
        loading={isLoading}
        tone="critical"
        size="medium"
      >
        Reset Product Data
      </Button>

      <Modal
        open={modalActive}
        onClose={handleModalChange}
        title="Reset Product Data"
        primaryAction={{
          content: 'Reset',
          onAction: handleReset,
          destructive: true,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: handleModalChange,
          },
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <p>
              This will delete all synced product data from the database. You will need to sync your products again after this operation.
            </p>
            <p>
              <strong>Warning:</strong> This action cannot be undone. All product tracking data, settings, and alert history will be permanently deleted.
            </p>
          </TextContainer>
        </Modal.Section>
      </Modal>
    </div>
  );
}