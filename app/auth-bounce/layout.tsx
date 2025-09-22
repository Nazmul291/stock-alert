import type { Metadata } from "next";
import PolarisProvider from '@/components/polaris-provider';

export const metadata: Metadata = {
  title: "Authenticating - Stock Alert",
  description: "Authenticating your session...",
};

export default function AuthBounceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY} />
        <link
          rel="stylesheet"
          href="https://unpkg.com/@shopify/polaris@12.27.0/build/esm/styles.css"
        />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </head>
      <body>
        <PolarisProvider>
          {children}
        </PolarisProvider>
      </body>
    </html>
  );
}