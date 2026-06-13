export default function TermsOfService() {
  const contactEmail = "nazmul291@gmail.com";
  const lastUpdated = "June 14, 2026";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Terms of Service — Stock Alert</title>
        <style>{`
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; margin: 0; padding: 0; background: #f9fafb; }
          .wrap { max-width: 720px; margin: 0 auto; padding: 48px 24px 80px; background: #fff; }
          h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
          .sub { color: #6b7280; font-size: 14px; margin-bottom: 36px; }
          h2 { font-size: 18px; font-weight: 700; margin: 32px 0 8px; color: #111827; }
          p, li { font-size: 15px; line-height: 1.7; color: #374151; }
          ul { padding-left: 20px; }
          a { color: #4f46e5; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 40px 0; }
        `}</style>
      </head>
      <body>
        <div className="wrap">
          <h1>Terms of Service</h1>
          <p className="sub">Stock Alert · Last updated {lastUpdated}</p>

          <p>
            These Terms of Service ("Terms") govern your use of the Stock Alert Shopify app
            ("Service") operated by Nazmul Codes ("we", "us", "our").
            By installing the app you agree to these Terms.
          </p>

          <h2>1. Description of Service</h2>
          <p>
            Stock Alert monitors your Shopify store's inventory levels and sends notifications
            (email, Slack, or webhook) when products reach low-stock or out-of-stock thresholds.
            Additional features include digest emails, back-in-stock customer signups, stock-out
            predictions, and analytics. Features vary by plan (Basic / Professional).
          </p>

          <h2>2. Eligibility</h2>
          <p>
            You must have an active Shopify store to use Stock Alert. You represent that you
            have the authority to bind your business to these Terms.
          </p>

          <h2>3. Subscriptions and Billing</h2>
          <ul>
            <li><strong>Free / Basic plan</strong> — available at no charge with limited features.</li>
            <li><strong>Professional plan</strong> — billed monthly through Shopify's in-app billing system. The current price is displayed in the app during upgrade.</li>
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

          <h2>6. Data and Privacy</h2>
          <p>
            Our collection and use of your data is governed by our{" "}
            <a href="/privacy">Privacy Policy</a>, which is incorporated into these Terms by reference.
          </p>

          <h2>7. Availability and Uptime</h2>
          <p>
            We aim for high availability but do not guarantee uninterrupted service. We are not
            liable for missed alerts caused by downtime, Shopify API outages, email delivery
            failures, or network issues beyond our control.
          </p>

          <h2>8. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind,
            express or implied, including but not limited to merchantability, fitness for a
            particular purpose, or non-infringement. We do not warrant that the Service will be
            error-free or that alerts will be delivered within any specific timeframe.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, our total liability to you for any claim
            arising from your use of the Service shall not exceed the fees you paid us in the
            three months preceding the claim. We are not liable for any indirect, incidental,
            special, consequential, or punitive damages, including lost profits or lost inventory
            value, even if we have been advised of the possibility of such damages.
          </p>

          <h2>10. Indemnification</h2>
          <p>
            You agree to indemnify and hold us harmless from any claims, damages, or expenses
            (including reasonable legal fees) arising from your use of the Service or violation
            of these Terms.
          </p>

          <h2>11. Termination</h2>
          <p>
            Either party may terminate the agreement at any time. You may terminate by
            uninstalling the app. We may suspend or terminate your access if you violate these
            Terms. Upon termination, your data will be deleted per our Privacy Policy.
          </p>

          <h2>12. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. The "last updated" date at the top
            reflects any changes. Continued use of the Service after changes constitutes
            acceptance of the updated Terms.
          </p>

          <h2>13. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the jurisdiction in which we operate,
            without regard to conflict of law provisions.
          </p>

          <h2>14. Contact</h2>
          <p>
            For questions about these Terms, contact us at:{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </p>

          <hr />
          <p style={{ fontSize: 13, color: "#9ca3af" }}>
            <a href="/privacy" style={{ color: "#9ca3af" }}>Privacy Policy</a>
            {" · "}
            Stock Alert by Nazmul Codes
          </p>
        </div>
      </body>
    </html>
  );
}
