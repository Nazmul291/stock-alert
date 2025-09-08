'use client';

import { Page, Layout, Card } from '@shopify/polaris';
import ProductsTable from './products-table';

interface ProductsContentProps {
  products: any[];
  searchParams: { shop?: string; host?: string };
}

export default function ProductsContent({ 
  products, 
  searchParams 
}: ProductsContentProps) {
  return (
    <Page
      title="Product Settings"
      backAction={{
        content: 'Home',
        url: `/?shop=${searchParams.shop}&host=${searchParams.host}`,
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <ProductsTable products={products} shop={searchParams.shop || ''} />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}