export default function TermsOfService() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Terms of Service</h1>
      <p className="text-sm text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
        <p className="mb-4">
          By installing and using Stock Alert, you agree to these Terms of Service.
          If you disagree with any part of these terms, please uninstall the app.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. Service Description</h2>
        <p className="mb-4">
          Stock Alert provides inventory management and notification services for Shopify stores, including:
        </p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Automated stock monitoring</li>
          <li>Low stock alerts via email and Slack</li>
          <li>Auto-hide/republish products based on inventory</li>
          <li>Custom threshold settings</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">3. User Responsibilities</h2>
        <p className="mb-4">You are responsible for:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Maintaining accurate inventory data in Shopify</li>
          <li>Configuring appropriate threshold settings</li>
          <li>Ensuring email addresses for notifications are valid</li>
          <li>Complying with Shopify's Terms of Service</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. Pricing and Billing</h2>
        <p className="mb-4">
          Stock Alert offers different service tiers. Charges are processed through Shopify's billing system.
          Subscription fees are non-refundable except as required by law.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. Service Availability</h2>
        <p className="mb-4">
          We strive for 99.9% uptime but do not guarantee uninterrupted service.
          Scheduled maintenance will be communicated in advance when possible.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">6. Limitation of Liability</h2>
        <p className="mb-4">
          Stock Alert is provided "as is" without warranties. We are not liable for:
        </p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Lost sales due to service interruptions</li>
          <li>Inaccurate inventory data from Shopify</li>
          <li>Delayed or missed notifications</li>
          <li>Any indirect or consequential damages</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">7. Data Usage</h2>
        <p className="mb-4">
          Your use of Stock Alert is also governed by our Privacy Policy.
          We process data according to GDPR and other applicable regulations.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">8. Termination</h2>
        <p className="mb-4">
          You may uninstall the app at any time. We reserve the right to suspend or terminate
          service for violations of these terms or suspicious activity.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">9. Modifications</h2>
        <p className="mb-4">
          We may modify these terms at any time. Continued use after changes constitutes
          acceptance of the new terms.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">10. Governing Law</h2>
        <p className="mb-4">
          These terms are governed by the laws of the jurisdiction where our company is registered,
          without regard to conflict of law principles.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
        <p className="mb-4">For questions about these terms, contact us at:</p>
        <ul className="space-y-2">
          <li>Email: info@nazmulcodes.org</li>
          <li>Website: https://stock-alert.nazmulcodes.org</li>
        </ul>
      </section>

      <footer className="mt-12 pt-8 border-t text-sm text-gray-600">
        <p>© {new Date().getFullYear()} Stock Alert. All rights reserved.</p>
      </footer>
    </div>
  );
}