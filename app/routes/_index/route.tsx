import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

const APP_NAME = "Stock Alert";
const TITLE = "Stock Alert — Low Stock & Back in Stock Alerts for Shopify";
const DESCRIPTION =
  "Stock Alert monitors your Shopify inventory in real time and sends instant email and Slack alerts the moment a product runs low or sells out — plus automatic back-in-stock notifications for your customers.";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
  return { showForm: Boolean(login), appUrl };
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

export default function App() {
  const { showForm, appUrl } = useLoaderData<typeof loader>();

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
    <div className={styles.index}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={styles.content}>
        <h1 className={styles.heading}>Never Lose a Sale to a Stockout</h1>
        <p className={styles.text}>{DESCRIPTION}</p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Install on Shopify
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Real-time low stock &amp; out-of-stock alerts.</strong> Get
            notified by email or Slack the moment inventory hits your
            threshold — before you lose the sale.
          </li>
          <li>
            <strong>Automatic back-in-stock notifications.</strong> Let
            shoppers sign up to be notified the instant a sold-out product is
            restocked.
          </li>
          <li>
            <strong>Auto-hide &amp; auto-republish.</strong> Automatically
            hide out-of-stock products and bring them back live the moment
            they&apos;re restocked.
          </li>
        </ul>
      </div>
    </div>
  );
}
