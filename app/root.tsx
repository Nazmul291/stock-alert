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
            {/* defer moves App Bridge off the critical rendering path.
                Authentication is handled server-side; App Bridge only needs to
                run before merchants interact with UI components (toast, modal,
                navigation), not before the page first paints.
                The style block below gives <s-*> Polaris web components a
                block display so layout is correct while the definition is
                still pending. */}
            <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" defer />
            <style dangerouslySetInnerHTML={{ __html:
              "s-page,s-section,s-card,s-header,s-footer,s-button,s-banner," +
              "s-badge,s-text,s-box,s-tabs,s-tab,s-tab-panel,s-paragraph," +
              "s-layout,s-layout-section{display:block}"
            }} />
          </>
        )}
        {wantsShopifyFont && (
          // Async font loading — preload starts the download immediately but
          // does not block first paint. The inline script adds a load listener
          // that swaps rel to stylesheet once the CSS arrives. For repeat
          // visitors (any merchant who uses Shopify admin) Inter is cached so
          // the swap happens before paint anyway. noscript covers JS-off envs.
          <>
            <link
              id="shopify-inter"
              rel="preload"
              as="style"
              href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
            />
            <script dangerouslySetInnerHTML={{ __html:
              "(function(){var l=document.getElementById('shopify-inter');" +
              "l&&l.addEventListener('load',function(){l.rel='stylesheet'})})()"
            }} />
            <noscript>
              <link rel="stylesheet" href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css" />
            </noscript>
          </>
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
