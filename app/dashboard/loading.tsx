'use client';

import { Layout, Card, SkeletonPage, SkeletonBodyText } from '@shopify/polaris';

export default function DashboardLoading() {
  return (
    <SkeletonPage primaryAction title="Dashboard" >
      <Layout>
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={2} />
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={3} />
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <SkeletonBodyText lines={5} />
          </Card>
        </Layout.Section>
      </Layout>
    </SkeletonPage>
  );
}