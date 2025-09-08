import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Performance optimizations
  reactStrictMode: true,
  
  // Skip type checking and linting during build
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  
  // Allow Shopify admin to load the app
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors https://*.myshopify.com https://admin.shopify.com",
          },
          {
            key: 'X-Frame-Options',
            value: 'ALLOWALL',
          },
        ],
      },
    ];
  },
  
  // Disable image optimization for Shopify CDN images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      {
        protocol: 'https',
        hostname: 'unpkg.com',
      },
    ],
  },
  
  // Optimize production builds
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  },
};

export default nextConfig;
