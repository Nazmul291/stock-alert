import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from "react-router";

export default function App() {
  const { pathname } = useLocation();
  const isEmbeddedAdmin = pathname.startsWith("/app") || pathname.startsWith("/admin") || pathname.startsWith("/auth");

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="google-site-verification" content="5-9_d1tv8yexXd1d5-AHSJAx99eflFWtIh_7XJ6BoIM" />
        {isEmbeddedAdmin && (
          <>
            <link rel="preconnect" href="https://cdn.shopify.com/" />
            <link
              rel="stylesheet"
              href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
            />
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
