import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { LandingHeader } from "../components/landing/LandingHeader";
import { LandingFooter } from "../components/landing/LandingFooter";
import chromeCss from "../styles/site-chrome.css?raw";
import blogCss from "../styles/blog.css?raw";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";
const TITLE = "Terms of Service — Stock Alert";
const DESCRIPTION = "The terms that govern your use of the Stock Alert Shopify app.";
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
  const url = `${appUrl}/terms`;
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

export default function TermsOfService() {
  useLoaderData<typeof loader>();

  return (
    <div className="sa-blogPage">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: pageCss }} />

      <LandingHeader appName={APP_NAME} appStoreUrl={APP_STORE_URL} />

      <main>
        <article className="sa-blogArticle">
          <header className="sa-blogArticleHeader">
            <h1>Terms of Service</h1>
          </header>
          <p className="sa-blogMeta">Stock Alert · Last updated {lastUpdated}</p>

          <div className="sa-blogBody">
            <p>
              These Terms of Service ("Terms") govern your use of the Stock Alert Shopify app
              ("Service") operated by Nazmul Codes ("we", "us", "our").
              By installing the app you agree to these Terms.
            </p>

            <h2>1. Description of Service</h2>
            <p>
              Stock Alert monitors your Shopify store's inventory levels and sends notifications
              (email or Slack, with WhatsApp coming soon) when products reach low-stock or
              out-of-stock thresholds. You may also connect Asana (to create tasks per stock event), Klaviyo (to send events
              into your marketing flows), Shopify Flow (to trigger your own workflows), or your own
              outbound webhook endpoint. Additional features include digest emails, back-in-stock
              customer signups, stock-out predictions, and analytics. Features vary by plan
              (Basic / Professional / Enterprise).
            </p>

            <h2>2. Eligibility</h2>
            <p>
              You must have an active Shopify store to use Stock Alert. You represent that you
              have the authority to bind your business to these Terms.
            </p>

            <h2>3. Subscriptions and Billing</h2>
            <ul>
              <li><strong>Basic, Professional, and Enterprise plans</strong> — billed monthly through Shopify's in-app billing system. The current price for each is displayed in the app during upgrade.</li>
              <li>Charges appear on your Shopify invoice. Shopify handles all payment processing.</li>
              <li>You may cancel at any time by uninstalling the app. Charges are pro-rated per Shopify's billing policies.</li>
              <li>We reserve the right to change pricing with 30 days' notice.</li>
            </ul>

            <h2>4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul>
              <li>Use the Service for any unlawful purpose or in violation of Shopify's Terms of Service.</li>
              <li>Attempt to reverse-engineer, decompile, or extract the source code of the Service.</li>
              <li>Use the Service to send unsolicited commercial email (spam).</li>
              <li>Overload our infrastructure through automated requests beyond normal use.</li>
            </ul>

            <h2>5. Shopify API and Permissions</h2>
            <p>
              Stock Alert requires access to your store's product, inventory, and order data via the
              Shopify API. We request only the scopes necessary to provide the Service. You can
              revoke access at any time by uninstalling the app.
            </p>

            <h2>6. Third-Party Integrations</h2>
            <p>
              Stock Alert lets you optionally connect third-party services — Slack, WhatsApp, Asana,
              Klaviyo, Shopify Flow, and outbound webhook endpoints you configure. Connecting these is
              your choice, and your use of each is also subject to that provider's own terms. We are
              not responsible for the availability, security, or handling of data by any third-party
              service you connect, or for how a destination you configure (such as your own webhook
              endpoint) uses data sent to it.
            </p>

            <h2>7. Data and Privacy</h2>
            <p>
              Our collection and use of your data is governed by our{" "}
              <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference.
            </p>

            <h2>8. Availability and Uptime</h2>
            <p>
              We aim for high availability but do not guarantee uninterrupted service. We are not
              liable for missed alerts caused by downtime, Shopify API outages, email delivery
              failures, or network issues beyond our control.
            </p>

            <h2>9. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind,
              express or implied, including but not limited to merchantability, fitness for a
              particular purpose, or non-infringement. We do not warrant that the Service will be
              error-free or that alerts will be delivered within any specific timeframe.
            </p>

            <h2>10. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, our total liability to you for any claim
              arising from your use of the Service shall not exceed the fees you paid us in the
              three months preceding the claim. We are not liable for any indirect, incidental,
              special, consequential, or punitive damages, including lost profits or lost inventory
              value, even if we have been advised of the possibility of such damages.
            </p>

            <h2>11. Indemnification</h2>
            <p>
              You agree to indemnify and hold us harmless from any claims, damages, or expenses
              (including reasonable legal fees) arising from your use of the Service or violation
              of these Terms.
            </p>

            <h2>12. Termination</h2>
            <p>
              Either party may terminate the agreement at any time. You may terminate by
              uninstalling the app. We may suspend or terminate your access if you violate these
              Terms. Upon termination, your data will be deleted per our Privacy Policy.
            </p>

            <h2>13. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. The "last updated" date at the top
              reflects any changes. Continued use of the Service after changes constitutes
              acceptance of the updated Terms.
            </p>

            <h2>14. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the jurisdiction in which we operate,
              without regard to conflict of law provisions.
            </p>

            <h2>15. Contact</h2>
            <p>
              For questions about these Terms, contact us at:{" "}
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          </div>
        </article>
      </main>

      <LandingFooter appName={APP_NAME} year={new Date().getFullYear()} />
    </div>
  );
}
