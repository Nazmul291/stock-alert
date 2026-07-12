import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { useEffect, useState } from "react";

import { useSSEData } from "../../hooks/use-sse-data";
import { LandingHeader } from "../../components/LandingHeader";
import { LandingHero } from "../../components/LandingHero";
import { LandingFeatures } from "../../components/LandingFeatures";
import { LandingPricing } from "../../components/LandingPricing";
import { LandingFinalCta } from "../../components/LandingFinalCta";
import { LandingFooter } from "../../components/LandingFooter";
// Inlined as a <style> tag below instead of a <link rel="stylesheet"> so this
// page has zero render-blocking network requests — the CSS ships in the same
// response as the HTML.
import inlineCss from "./styles.css?raw";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";
const TITLE = "Stock Alert — Low Stock & Back in Stock Alerts for Shopify";
const DESCRIPTION =
  "Stock Alert monitors your Shopify inventory in real time and sends instant email and Slack alerts the moment a product runs low or sells out — plus automatic back-in-stock notifications for your customers.";

// The landing page is fully static — appUrl comes from an env var that never
// changes at runtime. Cache aggressively so repeat visitors and CDNs never
// reach the origin. stale-while-revalidate lets CDNs serve immediately while
// refreshing in the background, eliminating any perceived latency for visitors.
export const headers: HeadersFunction = () => ({
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const hasEmbedParams = ["shop", "host", "embedded", "appLoadId"].some((key) => url.searchParams.has(key));
  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;

  return { appUrl, hasEmbedParams, search: url.search };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const appUrl = loaderData?.appUrl ?? "https://stock-alert.nazmulcodes.org";
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { tagName: "link", rel: "canonical", href: appUrl },
    { property: "og:type", content: "website" },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: appUrl },
    { property: "og:image", content: `${appUrl}/logo.png` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: TITLE },
    { name: "twitter:description", content: DESCRIPTION },
    { name: "twitter:image", content: `${appUrl}/logo.png` },
  ];
};

export default function LandingPage() {
  const { appUrl, hasEmbedParams, search } = useLoaderData<typeof loader>();
  const year = new Date().getFullYear();
  // Starts "ready" (not "loading") for a plain, non-embedded visit — this is a
  // useState initial value, so it's also what the server renders. If it
  // defaulted to "loading" unconditionally, crawlers and link-preview bots
  // would only ever see the skeleton instead of the marketing page.
  const [appStatus, setAppStatus] = useState<"loading" | "redirect" | "ready">(hasEmbedParams ? "loading" : "ready");

  // Only opens a connection for an embedded load — a plain marketing-page
  // visit never touches the server again after the initial document.
  const { data: entry } = useSSEData<{ embedded: boolean }>(
    hasEmbedParams ? `/api/entry-stream${search}` : null,
  );

  useEffect(() => {
    if (!hasEmbedParams) return; 

    if (new URLSearchParams(search).has("appLoadId")) {
      setAppStatus("redirect");
      window.location.replace(`/app${search}`);
      return;
    }

    if (entry?.embedded) {
      setAppStatus("redirect");
      window.location.replace(`/app${search}`);
      return
    }
    setAppStatus("ready");

  }, [entry, search, hasEmbedParams]);

  // Embedded load: skeleton until the redirect above fires. If the stream
  // ever resolves to embedded:false (shouldn't happen — the same params are
  // checked both here and in api.entry-stream.ts — kept as a safe fallback
  // rather than a stuck skeleton), fall through to the marketing page.
  if (appStatus === "loading" || appStatus === "redirect") {
    return (
      <div className="sa-entrySkeleton">
        {/* eslint-disable-next-line react/no-danger */}
        <style dangerouslySetInnerHTML={{ __html: inlineCss }} />
        <div className="sa-entrySpinner" />
      </div>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: appUrl,
    description: DESCRIPTION,
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "3.99",
      highPrice: "9.99",
      priceCurrency: "USD",
      offerCount: "2",
    },
  };

  return (
    <div className="sa-page">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: inlineCss }} />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <LandingHeader appName={APP_NAME} appStoreUrl={APP_STORE_URL} />

      <main>
        <LandingHero description={DESCRIPTION} appStoreUrl={APP_STORE_URL} />
        <LandingFeatures />
        <LandingPricing appStoreUrl={APP_STORE_URL} />
        <LandingFinalCta appStoreUrl={APP_STORE_URL} />
      </main>

      <LandingFooter appName={APP_NAME} year={year} />
    </div>
  );
}
