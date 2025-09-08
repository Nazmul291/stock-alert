import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PolarisProvider from '@/components/polaris-provider';
import AppBridgeProvider from '@/components/app-bridge-provider';
import ReduxProvider from '@/components/redux-provider';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Stock Alert - Inventory Management for Shopify",
  description: "Automatically manage inventory visibility and receive low stock alerts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="shopify-api-key" content="38a870cdc7f41175fd49a52689539f9d" />
        <link 
          rel="stylesheet" 
          href="https://unpkg.com/@shopify/polaris@12.27.0/build/esm/styles.css"
        />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key="38a870cdc7f41175fd49a52689539f9d"></script>
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ReduxProvider>
          <AppBridgeProvider>
            <PolarisProvider>
              {children}
            </PolarisProvider>
          </AppBridgeProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
