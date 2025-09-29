'use client';

import { useState, useEffect } from 'react';
import { Banner, Modal, TextContainer, Button } from '@shopify/polaris';
import { useRouter } from 'next/navigation';

interface AuthNotificationProps {
  onDismiss?: () => void;
}

export function AuthNotification({ onDismiss }: AuthNotificationProps) {
  const [showBanner, setShowBanner] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorType, setErrorType] = useState<'warning' | 'critical'>('warning');
  const router = useRouter();

  useEffect(() => {
    const handleAuthError = (event: CustomEvent) => {
      const { type, message, severity } = event.detail;

      if (severity === 'critical') {
        setErrorType('critical');
        setErrorMessage(message);
        setShowModal(true);
      } else {
        setErrorType('warning');
        setErrorMessage(message);
        setShowBanner(true);

        // Auto-dismiss warning after 5 seconds
        setTimeout(() => setShowBanner(false), 5000);
      }
    };

    window.addEventListener('auth-error' as any, handleAuthError);
    return () => window.removeEventListener('auth-error' as any, handleAuthError);
  }, []);

  const handleReload = () => {
    window.location.reload();
  };

  const handleReinstall = () => {
    const shop = new URLSearchParams(window.location.search).get('shop');
    if (shop) {
      window.location.href = `/api/auth?shop=${shop}&embedded=1`;
    }
  };

  if (showBanner) {
    return (
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: '600px',
        width: '90%'
      }}>
        <Banner
          tone={errorType}
          onDismiss={() => {
            setShowBanner(false);
            onDismiss?.();
          }}
        >
          <p>{errorMessage}</p>
        </Banner>
      </div>
    );
  }

  if (showModal) {
    return (
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Authentication Error"
        primaryAction={{
          content: 'Reload Page',
          onAction: handleReload
        }}
        secondaryActions={[
          {
            content: 'Reinstall App',
            onAction: handleReinstall
          }
        ]}
      >
        <Modal.Section>
          <TextContainer>
            <p>{errorMessage}</p>
            <p>
              You can try reloading the page to refresh your session, or reinstall
              the app if the problem persists.
            </p>
          </TextContainer>
        </Modal.Section>
      </Modal>
    );
  }

  return null;
}

// Helper function to trigger auth notifications
export function triggerAuthNotification(
  message: string,
  severity: 'warning' | 'critical' = 'warning'
) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('auth-error', {
      detail: {
        type: 'auth',
        message,
        severity
      }
    });
    window.dispatchEvent(event);
  }
}