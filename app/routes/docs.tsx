import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { LandingHeader } from "../components/landing/LandingHeader";
import { LandingFooter } from "../components/landing/LandingFooter";
import chromeCss from "../styles/site-chrome.css?raw";
import blogCss from "../styles/blog.css?raw";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";
const TITLE = "Documentation — Stock Alert";
const DESCRIPTION =
  "How to set up low-stock thresholds, notification channels, auto-hide/republish, and integrations in Stock Alert for Shopify.";
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
  const url = `${appUrl}/docs`;
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

const SECTIONS = [
  { id: "getting-started", label: "Getting started" },
  { id: "thresholds", label: "Stock thresholds" },
  { id: "notifications", label: "Notification channels" },
  { id: "auto-hide", label: "Auto-hide & auto-republish" },
  { id: "back-in-stock", label: "Back-in-stock widget" },
  { id: "predictions", label: "Predictions & analytics" },
  { id: "integrations", label: "Integrations" },
  { id: "suppliers", label: "Suppliers & purchase orders" },
  { id: "faq", label: "FAQ" },
];

export default function Docs() {
  useLoaderData<typeof loader>();

  return (
    <div className="sa-blogPage">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />

      <LandingHeader appName={APP_NAME} appStoreUrl={APP_STORE_URL} />

      <main>
        <article className="sa-blogArticle">
          <header className="sa-blogArticleHeader">
            <h1>Documentation</h1>
          </header>
          <p className="sa-blogMeta">
            Everything you need to set up and get the most out of Stock Alert.
          </p>

          <nav aria-label="On this page" style={{ marginBottom: 40 }}>
            <ul style={{ display: "flex", flexWrap: "wrap", gap: "8px 20px", padding: 0, listStyle: "none" }}>
              {SECTIONS.map((s) => (
                <li key={s.id} style={{ margin: 0 }}>
                  <a href={`#${s.id}`}>{s.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="sa-blogBody">
            <h2 id="getting-started">Getting started</h2>
            <p>
              Install Stock Alert from the Shopify App Store and it starts syncing your product and
              inventory data immediately. Every plan includes a 30-day free trial and no credit card is
              required to start it.
            </p>
            <ol>
              <li>Click <strong>Add to Shopify</strong> and approve the requested permissions.</li>
              <li>Pick a plan (Basic, Professional, or Enterprise) — you can change this later from the app's Billing page.</li>
              <li>Set a store-wide low-stock threshold, or leave the default while your sales data syncs.</li>
              <li>Choose which channels should receive alerts: email, WhatsApp, and (on Professional+) Slack.</li>
            </ol>

            <h2 id="thresholds">Stock thresholds</h2>
            <p>
              A global threshold applies to every product by default — once available inventory drops to
              or below that number, Stock Alert fires a low-stock alert. On Professional and Enterprise
              plans you can override the threshold per product, or scope monitoring to specific
              collections and tags, instead of applying one number store-wide.
            </p>

            <h2 id="notifications">Notification channels</h2>
            <p>
              Alerts go out the instant inventory crosses your threshold, before the sale is lost:
            </p>
            <ul>
              <li><strong>Email</strong> — included on every plan.</li>
              <li><strong>WhatsApp</strong> — included on every plan.</li>
              <li><strong>Slack</strong> — one-click Slack Connect, available on Professional and Enterprise.</li>
              <li><strong>Multiple recipients</strong> and <strong>white-label branded emails</strong> — available on Professional and Enterprise.</li>
            </ul>

            <h2 id="auto-hide">Auto-hide & auto-republish</h2>
            <p>
              Sold-out products are automatically hidden from your storefront on every plan, so shoppers
              never land on a page they can't buy from. On Professional and Enterprise, Stock Alert also
              auto-republishes the product the instant it's restocked — no manual re-listing needed.
            </p>

            <h2 id="back-in-stock">Back-in-stock widget</h2>
            <p>
              Add the back-in-stock signup widget to any sold-out product page. Shoppers who opt in are
              emailed automatically the moment the product restocks — collected with explicit consent and
              used only for that single notification.
            </p>

            <h2 id="predictions">Predictions & analytics</h2>
            <p>
              The analytics dashboard tracks alert history, stock-out trends, and webhook delivery health
              across your catalog, and surfaces which products are projected to sell out within 7 days
              based on your real sales velocity. Daily or weekly digest emails summarize this for you
              without needing to check the dashboard.
            </p>

            <h2 id="integrations">Integrations</h2>
            <p>Available on Professional and Enterprise:</p>
            <ul>
              <li><strong>Klaviyo</strong> — send low-stock and back-in-stock events into Klaviyo to power marketing flows and segments.</li>
              <li><strong>Outbound webhooks</strong> — pipe every alert into Zapier, Make, or your own ERP.</li>
              <li><strong>Asana</strong> — automatically create a task for stock events you map.</li>
              <li><strong>Shopify Flow</strong> — native triggers on low-stock, out-of-stock, and restock events, no code required (included on every plan).</li>
            </ul>

            <h2 id="suppliers">Suppliers & purchase orders</h2>
            <p>
              Enterprise adds supplier management: record vendor lead times, get reorder-point
              recommendations calculated from those lead times, and generate purchase orders directly from
              a low-stock alert. Enterprise also unlocks dead stock alerts and Core vs. Limited-Edition
              report sections in analytics.
            </p>

            <h2 id="faq">FAQ</h2>
            <h3>Do I need a credit card to start my trial?</h3>
            <p>No — every plan includes a 30-day free trial with no credit card required to start it.</p>
            <h3>What happens to my data if I uninstall?</h3>
            <p>
              Shopify sends us a <code>shop/redact</code> webhook within 48 hours of uninstall, which
              permanently deletes all of your store's data from our systems — see the{" "}
              <a href="/privacy">Privacy Policy</a> for details.
            </p>
            <h3>Can I switch plans later?</h3>
            <p>Yes, you can upgrade or downgrade at any time from the app's Billing page.</p>
            <h3>Still have questions?</h3>
            <p>
              Contact us at <a href="mailto:nazmul291@gmail.com">nazmul291@gmail.com</a>.
            </p>
          </div>
        </article>
      </main>

      <LandingFooter appName={APP_NAME} year={new Date().getFullYear()} />
    </div>
  );
}
