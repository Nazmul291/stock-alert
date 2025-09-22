import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PolarisProvider from '@/components/polaris-provider';
import AppBridgeProvider from '@/components/app-bridge-provider';
import ReduxProvider from '@/components/redux-provider';
import SessionMonitor from '@/components/session-monitor';

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
        <meta name="shopify-api-key" content={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY} />
        <link 
          rel="stylesheet" 
          href="https://unpkg.com/@shopify/polaris@12.27.0/build/esm/styles.css"
        />
        <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ReduxProvider>
          <AppBridgeProvider>
            <PolarisProvider>
              {/* <SessionMonitor /> */}
              {children}
            </PolarisProvider>
          </AppBridgeProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
