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
        {(isShopifyEmbedded || wantsShopifyFont) && (
          // crossOrigin is required for the preconnect to cover CORS requests
          // (scripts and stylesheets from a different origin). Without it the
          // browser opens a non-CORS socket, then has to open a second CORS
          // socket when the actual resource request arrives — wasting the hint.
          <link rel="preconnect" href="https://cdn.shopify.com/" crossOrigin="anonymous" />
        )}
        {isShopifyEmbedded && (
          <>
            <meta name="shopify-api-key" content={apiKey} />
            {/* Preload kicks off the download immediately — before the parser
                reaches the <script> tag below. Combined with the preconnect
                above (warm TLS), App Bridge is typically already in the
                browser cache by the time it's needed, eliminating the
                blocking wait without self-hosting the script. */}
            <link
              rel="preload"
              as="script"
              href="https://cdn.shopify.com/shopifycloud/app-bridge.js"
              crossOrigin="anonymous"
            />
            {/* Must remain synchronous — defines <s-*> Polaris components and
                drives the auth session-token bounce before content renders. */}
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" />
          </>
        )}
        {wantsShopifyFont && (
          // Blocking stylesheet, not preload-then-swap. These pages only ever
          // load inside admin.shopify.com, which loads this exact stylesheet
          // itself — Chrome's cache is partitioned by (top-level site,
          // resource origin), so it's already warm here in the vast majority
          // of sessions. The old async-swap trick traded a rare cold-cache
          // wait for a guaranteed FOUT reflow (CLS) on every other load.
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
