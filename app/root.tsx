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
          <>
            {/* Loaded as a non-blocking preload that swaps to a stylesheet once
                fetched, instead of a blocking <link rel="stylesheet">, so the font
                round-trip doesn't hold up the first paint. React's onLoad prop can't
                emit a literal onload="" attribute (it only binds JS event handlers,
                which don't serialize into static SSR HTML), so the swap is done via
                a tiny inline script instead — CSP here only restricts frame-ancestors,
                so inline scripts are unaffected. */}
            <link
              rel="preload"
              as="style"
              href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
            />
            <script
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{
                __html:
                  "(function(){var l=document.currentScript.previousElementSibling;l.addEventListener('load',function(){l.rel='stylesheet';});})();",
              }}
            />
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
