import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { LandingHeader } from "../components/landing/LandingHeader";
import { LandingFooter } from "../components/landing/LandingFooter";
import chromeCss from "../styles/site-chrome.css?raw";
import blogCss from "../styles/blog.css?raw";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";
const TITLE = "Privacy Policy — Stock Alert";
const DESCRIPTION = "What data Stock Alert collects, how it's used, and your rights.";
const contactEmail = "nazmul291@gmail.com";
const lastUpdated = "July 6, 2026";
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
  const url = `${appUrl}/privacy`;
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type", content: "website" },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: url },
  ];
};

export default function PrivacyPolicy() {
  useLoaderData<typeof loader>();

  return (
    <div className="sa-blogPage">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />

      <LandingHeader appName={APP_NAME} appStoreUrl={APP_STORE_URL} />

      <main>
        <article className="sa-blogArticle">
          <header className="sa-blogArticleHeader">
            <h1>Privacy Policy</h1>
          </header>
          <p className="sa-blogMeta">Stock Alert · Last updated {lastUpdated}</p>

          <div className="sa-blogBody">
            <p>
              Stock Alert ("we", "our", "the app") is a Shopify app that monitors inventory levels
              and sends notifications to store owners. This policy explains what data we collect,
              how we use it, and your rights.
            </p>

            <h2>1. Data We Collect</h2>
            <ul>
              <li><strong>Store information</strong> — your Shopify shop domain, access token, and account email, obtained via Shopify OAuth when you install the app.</li>
              <li><strong>Product and inventory data</strong> — product titles, SKUs, and inventory quantities synced from your Shopify store to power alert calculations.</li>
              <li><strong>Notification settings</strong> — email addresses you provide for receiving alerts, and your phone number if you verify it for WhatsApp alerts (coming soon).</li>
              <li><strong>Slack</strong> — an access token and incoming-webhook URL obtained via Slack OAuth when you connect a Slack workspace, used only to post alerts to the channel you choose.</li>
              <li><strong>Asana</strong> — an OAuth access token and refresh token, plus the workspace, project, and section names you select, used only to create a task in Asana for each stock event you map.</li>
              <li><strong>Klaviyo</strong> — the private API key you provide, used only to send inventory event data to your own Klaviyo account.</li>
              <li><strong>Outbound webhook</strong> — the URL you provide; we POST a JSON payload of the alert event to it. We do not store the payload beyond delivery.</li>
              <li><strong>Alert history</strong> — a log of notifications sent, including product name, alert type, and timestamp.</li>
              <li><strong>Back-in-stock subscribers</strong> — email addresses collected via the optional storefront widget from customers who opt in to restock notifications. These are collected with customer consent and are used solely to send a single restock email per product.</li>
              <li><strong>Order data (read-only)</strong> — aggregate sales counts from your last 30 days of orders, used only to calculate stock-out prediction ("days remaining"). Individual order details are not stored.</li>
            </ul>

            <h2>2. How We Use Your Data</h2>
            <ul>
              <li>To monitor your inventory and send low-stock, out-of-stock, and restock alerts by email or Slack (and WhatsApp, coming soon).</li>
              <li>To create Asana tasks and/or send events to Klaviyo or your outbound webhook URL, for the channels you choose to connect.</li>
              <li>To calculate stock-out predictions and reorder dates.</li>
              <li>To send digest email summaries and back-in-stock notifications to subscribed customers.</li>
              <li>To display analytics about your alert history within the app.</li>
            </ul>
            <p>We do <strong>not</strong> sell, rent, or share your data with third parties for marketing purposes.</p>

            <h2>3. Data Storage and Security</h2>
            <p>
              Data is stored in a PostgreSQL database hosted on Supabase (EU West region).
              Access tokens are encrypted at rest. We use HTTPS for all data in transit.
              Access to the database is restricted to application servers only.
            </p>

            <h2>4. Data Retention</h2>
            <p>
              Your data is retained for as long as your store has the app installed.
              When you uninstall Stock Alert, Shopify sends us a <code>shop/redact</code> webhook
              within 48 hours, which permanently deletes all your store data from our systems —
              including settings, product tracking records, alert history, back-in-stock subscribers,
              and any connected Slack, Asana, or Klaviyo tokens and configuration.
            </p>

            <h2>5. Third-Party Services</h2>
            <ul>
              <li><strong>Shopify</strong> — the platform through which you authenticate and from which we read inventory and order data. Subject to <a href="https://www.shopify.com/legal/privacy" target="_blank" rel="noopener noreferrer">Shopify's Privacy Policy</a>.</li>
              <li><strong>Supabase</strong> — database hosting. Subject to <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase's Privacy Policy</a>.</li>
              <li><strong>Fly.io</strong> — application hosting. Subject to <a href="https://fly.io/legal/privacy-policy" target="_blank" rel="noopener noreferrer">Fly.io's Privacy Policy</a>.</li>
              <li><strong>SMTP provider</strong> — used to deliver email notifications. Email addresses are passed to our email provider only for the purpose of sending notifications.</li>
              <li><strong>Slack</strong> — if you connect Slack, alert payloads are sent to the workspace and channel you authorize. Subject to <a href="https://slack.com/trust/privacy/privacy-policy" target="_blank" rel="noopener noreferrer">Slack's Privacy Policy</a>.</li>
              <li><strong>WhatsApp (Meta)</strong> — coming soon. Once available, alerts to a verified WhatsApp number will be delivered via the WhatsApp Business Platform, subject to <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">WhatsApp's Privacy Policy</a>.</li>
              <li><strong>Asana</strong> — if you connect Asana, stock event data (product name, quantity) is sent to create tasks in the workspace and project you choose. Subject to <a href="https://asana.com/privacy" target="_blank" rel="noopener noreferrer">Asana's Privacy Policy</a>.</li>
              <li><strong>Klaviyo</strong> — if you connect Klaviyo, inventory event data is sent to your own Klaviyo account. Subject to <a href="https://www.klaviyo.com/policies/privacy" target="_blank" rel="noopener noreferrer">Klaviyo's Privacy Policy</a>.</li>
              <li><strong>Your outbound webhook endpoint</strong> — if you configure one, we POST alert event data to the URL you provide (e.g. Zapier, Make, or your own systems). You are responsible for how that destination handles the data.</li>
            </ul>

            <h2>6. GDPR and Your Rights</h2>
            <p>
              If you or your customers are in the European Economic Area (EEA), you have the right to:
            </p>
            <ul>
              <li>Access the personal data we hold about you.</li>
              <li>Request correction or deletion of your data.</li>
              <li>Object to or restrict processing of your data.</li>
              <li>Data portability — receive your data in a structured format.</li>
            </ul>
            <p>
              We comply with Shopify's mandatory GDPR webhooks:{" "}
              <code>customers/data_request</code>, <code>customers/redact</code>, and <code>shop/redact</code>.
              Back-in-stock customer emails are collected with explicit opt-in consent and can be
              deleted at any time via the unsubscribe link in each notification email or by contacting us.
            </p>

            <h2>7. Children's Privacy</h2>
            <p>Stock Alert is intended for use by Shopify merchants (businesses). We do not knowingly collect data from individuals under 16 years of age.</p>

            <h2>8. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. The "last updated" date at the top of this
              page will reflect any changes. Continued use of the app after changes constitutes
              acceptance of the updated policy.
            </p>

            <h2>9. Contact</h2>
            <p>
              For privacy-related questions or data requests, contact us at:{" "}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          </div>
        </article>
      </main>

      <LandingFooter appName={APP_NAME} year={new Date().getFullYear()} />
    </div>
  );
}
