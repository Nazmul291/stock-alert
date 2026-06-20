import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";

import { PLAN_LIMITS } from "../../lib/plan-limits";
import styles from "./styles.module.css";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
  return { appUrl };
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
  const { appUrl } = useLoaderData<typeof loader>();
  const year = new Date().getFullYear();

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
    <div className={styles.page}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <img src="/logo.png" alt="" className={styles.brandLogo} />
            <span>{APP_NAME}</span>
          </div>
          <nav className={styles.nav}>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <a
            className={styles.headerCta}
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Shopify
          </a>
        </div>
      </header>

      <main>
        <section className={styles.hero}>
          <h1 className={styles.heroHeading}>Never Lose a Sale to a Stockout</h1>
          <p className={styles.heroText}>{DESCRIPTION}</p>
          <div className={styles.heroActions}>
            <a
              className={styles.primaryButton}
              href={APP_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Shopify — Free 30-day trial
            </a>
            <a className={styles.secondaryButton} href="#features">
              See how it works
            </a>
          </div>
          <p className={styles.heroNote}>
            Installs in under 2 minutes · No credit card required to start your trial
          </p>
        </section>

        <section id="features" className={styles.features}>
          <h2 className={styles.sectionHeading}>Everything you need to stop stockouts</h2>
          <div className={styles.featureGrid}>
            {FEATURES.map((f) => (
              <div key={f.title} className={styles.featureCard}>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className={styles.pricing}>
          <h2 className={styles.sectionHeading}>Simple, transparent pricing</h2>
          <p className={styles.sectionSub}>Every plan includes a 30-day free trial.</p>
          <div className={styles.pricingGrid}>
            {(["basic", "pro"] as const).map((key) => {
              const plan = PLAN_LIMITS[key];
              return (
                <div
                  key={key}
                  className={key === "pro" ? `${styles.pricingCard} ${styles.pricingCardHighlight}` : styles.pricingCard}
                >
                  <h3>{plan.name}</h3>
                  <p className={styles.price}>{plan.price}</p>
                  <ul>
                    {plan.features.map((feat) => (
                      <li key={feat}>{feat}</li>
                    ))}
                  </ul>
                  <a
                    className={key === "pro" ? styles.primaryButton : styles.secondaryButton}
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

        <section className={styles.finalCta}>
          <h2>Ready to stop losing sales to stockouts?</h2>
          <a
            className={styles.primaryButton}
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Add to Shopify — Free 30-day trial
          </a>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© {year} {APP_NAME}</span>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="mailto:nazmul291@gmail.com">Support</a>
      </footer>
    </div>
  );
}
