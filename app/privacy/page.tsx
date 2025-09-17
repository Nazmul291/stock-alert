export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-gray-600 mb-8">Last updated: {new Date().toLocaleDateString()}</p>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">1. Information We Collect</h2>
        <p className="mb-4">Stock Alert collects the following information to provide inventory management services:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Store information (domain, email, shop ID)</li>
          <li>Product data (names, SKUs, inventory levels, variants)</li>
          <li>Email addresses for notifications</li>
          <li>Slack workspace information (if connected)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">2. How We Use Your Information</h2>
        <p className="mb-4">We use collected information to:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Monitor inventory levels and send alerts</li>
          <li>Auto-hide and republish products based on stock</li>
          <li>Send low stock notifications via email or Slack</li>
          <li>Provide customer support</li>
          <li>Improve app functionality</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">3. Data Storage and Security</h2>
        <p className="mb-4">
          We store your data securely using Supabase with encryption at rest and in transit.
          We implement industry-standard security measures to protect your information from
          unauthorized access, disclosure, or destruction.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">4. Data Sharing</h2>
        <p className="mb-4">We do not sell, trade, or rent your information to third parties. We only share data with:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Shopify (for app functionality)</li>
          <li>Slack (if you enable Slack notifications)</li>
          <li>Email service providers (for sending alerts)</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">5. Data Retention</h2>
        <p className="mb-4">
          We retain your data as long as you use our app. Upon uninstallation, we delete your data
          within 30 days unless required by law to retain it longer.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
        <p className="mb-4">You have the right to:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Access your personal data</li>
          <li>Request data correction or deletion</li>
          <li>Opt-out of notifications</li>
          <li>Export your data</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">7. GDPR Compliance</h2>
        <p className="mb-4">
          We comply with GDPR requirements for EU merchants, including data portability,
          right to deletion, and explicit consent for data processing.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">8. Cookies</h2>
        <p className="mb-4">
          We use essential cookies for app functionality and session management.
          No tracking or advertising cookies are used.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">9. Changes to Privacy Policy</h2>
        <p className="mb-4">
          We may update this policy periodically. Significant changes will be notified
          via email or app dashboard notification.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
        <p className="mb-4">For privacy concerns or questions, contact us at:</p>
        <ul className="space-y-2">
          <li>Email: support@stockalert.app</li>
          <li>Website: https://stock-alert.nazmulcodes.org</li>
        </ul>
      </section>

      <footer className="mt-12 pt-8 border-t text-sm text-gray-600">
        <p>© {new Date().getFullYear()} Stock Alert. All rights reserved.</p>
      </footer>
    </div>
  );
}