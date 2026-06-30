import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useLocation } from "react-router";

export const loader = () => {
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const { pathname } = useLocation();
  // /admin and /auth are not rendered inside the Shopify admin iframe — only /app is.
  const isShopifyEmbedded = pathname.startsWith("/app");
  const wantsShopifyFont = isShopifyEmbedded || pathname.startsWith("/admin") || pathname.startsWith("/auth");

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="google-site-verification" content="5-9_d1tv8yexXd1d5-AHSJAx99eflFWtIh_7XJ6BoIM" />
        {/* Preconnect before the app-bridge script tag below so the TLS handshake to
            cdn.shopify.com overlaps with head parsing instead of starting only once
            the script is reached. */}
        {(isShopifyEmbedded || wantsShopifyFont) && <link rel="preconnect" href="https://cdn.shopify.com/" />}
        {isShopifyEmbedded && (
          <>
            <meta name="shopify-api-key" content={apiKey} />
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
          </>
        )}
        {wantsShopifyFont && (
          // Render-blocking stylesheet instead of the old preload+script trick.
          // App Bridge is already a blocking <script> on the same cdn.shopify.com
          // host, so the connection is warm and the font CSS (small, cached for any
          // merchant who has visited Shopify admin) adds no perceptible delay.
          // The old non-blocking approach caused font-display:swap to fire after
          // first render, shifting every text element on the page (CLS ~0.15).
          <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
        )}
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
