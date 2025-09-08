'use client';

import { useState, useTransition } from 'react';
import {
  DataTable,
  TextField,
  Button,
  Badge,
  EmptyState,
  Modal,
  FormLayout,
  Checkbox,
} from '@shopify/polaris';
import { updateProductSettings } from '@/app/actions/settings';

interface Product {
  product_id: number;
  product_title: string;
  variants: any[];
  total_quantity: number;
  settings: any;
}

interface ProductsTableProps {
  products: Product[];
  shop: string;
}

export default function ProductsTable({ products: initialProducts, shop }: ProductsTableProps) {
  const [products, setProducts] = useState(initialProducts);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalActive, setModalActive] = useState(false);
  const [productSettings, setProductSettings] = useState({
    custom_threshold: '',
    exclude_from_auto_hide: false,
    exclude_from_alerts: false,
  });
  const [isPending, startTransition] = useTransition();

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductSettings({
      custom_threshold: product.settings?.custom_threshold?.toString() || '',
      exclude_from_auto_hide: product.settings?.exclude_from_auto_hide || false,
      exclude_from_alerts: product.settings?.exclude_from_alerts || false,
    });
    setModalActive(true);
  };

  const handleSaveProductSettings = () => {
    if (!selectedProduct) return;

    startTransition(async () => {
      try {
        await updateProductSettings(selectedProduct.product_id, {
          custom_threshold: productSettings.custom_threshold ? parseInt(productSettings.custom_threshold) : null,
          exclude_from_auto_hide: productSettings.exclude_from_auto_hide,
          exclude_from_alerts: productSettings.exclude_from_alerts,
        }, shop);

        // Update local state
        setProducts(prev => prev.map(p => 
          p.product_id === selectedProduct.product_id 
            ? { ...p, settings: { ...productSettings } }
            : p
        ));

        setModalActive(false);
      } catch (error) {
        console.error('Error saving product settings:', error);
      }
    });
  };

  const filteredProducts = products.filter(
    (product) =>
      product.product_title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const productRows = filteredProducts.map((product) => [
    product.product_title,
    product.variants.length.toString(),
    product.total_quantity.toString(),
    product.total_quantity === 0 ? (
      <Badge tone="critical">Out of Stock</Badge>
    ) : product.total_quantity <= 5 ? (
      <Badge tone="warning">Low Stock</Badge>
    ) : (
      <Badge tone="success">In Stock</Badge>
    ),
    product.settings?.custom_threshold || '-',
    <Button onClick={() => handleEditProduct(product)}>Edit Settings</Button>,
  ]);

  return (
    <>
      <div style={{ padding: '20px' }}>
        <TextField
          label=""
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search products..."
          autoComplete="off"
        />
      </div>

      <div style={{ padding: '20px' }}>
        {filteredProducts.length > 0 ? (
          <DataTable
            columnContentTypes={['text', 'numeric', 'numeric', 'text', 'text', 'text']}
            headings={['Product', 'Variants', 'Total Stock', 'Status', 'Custom Threshold', 'Actions']}
            rows={productRows}
          />
        ) : (
          <EmptyState
            heading="No products found"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <p>Products will appear here once your inventory is synced.</p>
          </EmptyState>
        )}
      </div>

      <Modal
        open={modalActive}
        onClose={() => setModalActive(false)}
        title={`Edit Settings: ${selectedProduct?.product_title}`}
        primaryAction={{
          content: 'Save',
          onAction: handleSaveProductSettings,
          loading: isPending,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setModalActive(false),
          },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Custom low stock threshold"
              type="number"
              value={productSettings.custom_threshold}
              onChange={(value) => setProductSettings({ ...productSettings, custom_threshold: value })}
              placeholder="Leave empty to use global setting"
              helpText="Override the global threshold for this product"
              autoComplete="off"
            />
            
            <Checkbox
              label="Exclude from auto-hide"
              checked={productSettings.exclude_from_auto_hide}
              onChange={(value) => setProductSettings({ ...productSettings, exclude_from_auto_hide: value })}
              helpText="This product won't be hidden when out of stock"
            />
            
            <Checkbox
              label="Exclude from alerts"
              checked={productSettings.exclude_from_alerts}
              onChange={(value) => setProductSettings({ ...productSettings, exclude_from_alerts: value })}
              helpText="Don't send alerts for this product"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </>
  );
}