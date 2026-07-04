import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { useEffect, useState } from "react";

import { PLAN_LIMITS } from "../../lib/plan-limits";
import logoMark from "../../assets/logo-mark.png";
import { useSSEData } from "../../hooks/use-sse-data";
// Inlined as a <style> tag below instead of a <link rel="stylesheet"> so this
// page has zero render-blocking network requests — the CSS ships in the same
// response as the HTML.
import inlineCss from "./styles.css?raw";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";
const TITLE = "Stock Alert — Low Stock & Back in Stock Alerts for Shopify";
const DESCRIPTION =
  "Stock Alert monitors your Shopify inventory in real time and sends instant email and Slack alerts the moment a product runs low or sells out — plus automatic back-in-stock notifications for your customers.";

const FEATURES = [
  {
    title: "Real-time low & out-of-stock alerts",
    body: "Get notified by email or Slack the instant inventory crosses your threshold — before you lose the sale.",
  },
  {
    title: "Automatic back-in-stock notifications",
    body: "Let shoppers sign up on a sold-out product page and get notified automatically the moment it's restocked.",
  },
  {
    title: "Auto-hide & auto-republish",
    body: "Sold-out products are hidden from your storefront automatically, then brought back live the instant they restock.",
  },
  {
    title: "Per-product thresholds",
    body: "Set a global low-stock threshold store-wide, or fine-tune it product by product for fast or slow movers.",
  },
  {
    title: "Stock-out predictions",
    body: "See which products are projected to sell out within 7 days, based on your real sales velocity.",
  },
  {
    title: "Analytics dashboard",
    body: "Track alert history, stock-out trends, and webhook health across your entire catalog in one place.",
  },
];

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
    if (!hasEmbedParams) return; // already "ready" — no SSE call was made
    if (entry?.embedded) {
      setAppStatus("redirect");
      window.location.replace(`/app${search}`);
    } else if (entry) {
      // Stream resolved but says not embedded — shouldn't happen (same params
      // checked both here and in api.entry-stream.ts), but avoids a stuck
      // skeleton instead of assuming "ready" merely because `entry` starts
      // out null while the SSE call is still in flight.
      setAppStatus("ready");
    }
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
        <p>Loading...</p>
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

      <header className="sa-header">
        <div className="sa-headerInner">
          <div className="sa-brand">
            <img src={logoMark} alt="" className="sa-brandLogo" />
            <span>{APP_NAME}</span>
          </div>
          <nav className="sa-nav">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <a
            className="sa-headerCta"
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Shopify
          </a>
        </div>
      </header>

      <main>
        <section className="sa-hero">
          <h1 className="sa-heroHeading">Never Lose a Sale to a Stockout</h1>
          <p className="sa-heroText">{DESCRIPTION}</p>
          <div className="sa-heroActions">
            <a
              className="sa-primaryButton"
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Shopify — Free 30-day trial
            </a>
            <a className="sa-secondaryButton" href="#features">
              See how it works
            </a>
          </div>
          <p className="sa-heroNote">
            Installs in under 2 minutes · No credit card required to start your trial
          </p>
        </section>

        <section id="features" className="sa-features">
          <h2 className="sa-sectionHeading">Everything you need to stop stockouts</h2>
          <div className="sa-featureGrid">
            {FEATURES.map((f) => (
              <div key={f.title} className="sa-featureCard">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="sa-pricing">
          <h2 className="sa-sectionHeading">Simple, transparent pricing</h2>
          <p className="sa-sectionSub">Every plan includes a 30-day free trial.</p>
          <div className="sa-pricingGrid">
            {(["basic", "pro"] as const).map((key) => {
              const plan = PLAN_LIMITS[key];
              return (
                <div
                  key={key}
                  className={key === "pro" ? "sa-pricingCard sa-pricingCardHighlight" : "sa-pricingCard"}
                >
                  <h3>{plan.name}</h3>
                  <p className="sa-price">{plan.price}</p>
                  <ul>
                    {plan.features.map((feat) => (
                      <li key={feat}>{feat}</li>
                    ))}
                  </ul>
                  <a
                    className={key === "pro" ? "sa-primaryButton" : "sa-secondaryButton"}
                    href={APP_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Start free trial
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        <section className="sa-finalCta">
          <h2>Ready to stop losing sales to stockouts?</h2>
          <a
            className="sa-primaryButton"
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Shopify — Free 30-day trial
          </a>
        </section>
      </main>

      <footer className="sa-footer">
        <span>© {year} {APP_NAME}</span>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="mailto:nazmul291@gmail.com">Support</a>
      </footer>
    </div>
  );
}
