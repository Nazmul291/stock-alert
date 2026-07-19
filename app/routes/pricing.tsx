import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { LandingHeader } from "../components/landing/LandingHeader";
import { LandingPricing } from "../components/landing/LandingPricing";
import { LandingFooter } from "../components/landing/LandingFooter";
import { BillingFeatureComparisonTable } from "../components/billing/BillingFeatureComparisonTable";
import chromeCss from "../styles/site-chrome.css?raw";
import blogCss from "../styles/blog.css?raw";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";
const TITLE = "Pricing — Stock Alert";
const DESCRIPTION =
  "Simple, transparent pricing for Stock Alert — Basic, Professional, and Enterprise plans, each with a 30-day free trial. Compare every feature side by side.";
const pageCss = `${chromeCss}\n${blogCss}`;

// Static content — cache aggressively, same rationale as the landing page.
export const headers: HeadersFunction = () => ({
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  return { appUrl };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const appUrl = loaderData?.appUrl ?? "https://stock-alert.nazmulcodes.org";
  const url = `${appUrl}/pricing`;
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type", content: "website" },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: url },
    { property: "og:image", content: `${appUrl}/logo.png` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: TITLE },
    { name: "twitter:description", content: DESCRIPTION },
    { name: "twitter:image", content: `${appUrl}/logo.png` },
  ];
};

export default function Pricing() {
  useLoaderData<typeof loader>();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Stock Alert",
    offers: {
      "@type": "AggregateOffer",
      lowPrice: "3.99",
      highPrice: "19.99",
      priceCurrency: "USD",
      offerCount: "3",
    },
  };

  return (
    <div className="sa-blogPage">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <LandingHeader appName={APP_NAME} appStoreUrl={APP_STORE_URL} />

      <main>
        <LandingPricing appStoreUrl={APP_STORE_URL} />

        <section className="sa-compare">
          <h2 className="sa-sectionHeading">Compare every feature</h2>
          <p className="sa-sectionSub">Everything each plan includes, side by side.</p>
          <BillingFeatureComparisonTable />
        </section>

        <p className="sa-trialNote">
          Every plan starts with a 30-day free trial — no charge until the trial ends. Cancel
          anytime before the trial expires and you won't be billed.
        </p>
      </main>

      <LandingFooter appName={APP_NAME} year={new Date().getFullYear()} />
    </div>
  );
}
