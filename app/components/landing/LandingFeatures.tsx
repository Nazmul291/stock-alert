const FEATURES = [
  {
    title: "Real-time low & out-of-stock alerts",
    body: "Get notified by email, Slack, or WhatsApp the instant inventory crosses your threshold — before you lose the sale.",
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
    title: "Per-product thresholds & filtering",
    body: "Set a global low-stock threshold store-wide, fine-tune it per product, or scope monitoring by collection and tag.",
  },
  {
    title: "Stock-out predictions",
    body: "See which products are projected to sell out within 7 days, based on your real sales velocity.",
  },
  {
    title: "Analytics dashboard",
    body: "Track alert history, stock-out trends, and webhook health across your catalog — plus daily or weekly digest emails.",
  },
  {
    title: "Klaviyo integration",
    body: "Send low-stock and back-in-stock events straight into Klaviyo to power real marketing flows and segments.",
  },
  {
    title: "Native Shopify Flow triggers",
    body: "Build custom automations on low-stock, out-of-stock, or restock events — no code required.",
  },
  {
    title: "Outbound webhooks",
    body: "Pipe every alert into Zapier, Make, or your own ERP the moment stock changes.",
  },
];

export function LandingFeatures() {
  return (
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
  );
}
