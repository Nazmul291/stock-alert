function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const FEATURES = [
  {
    title: "Real-time low & out-of-stock alerts",
    body: "Get notified by email, Slack, or WhatsApp the instant inventory crosses your threshold — before you lose the sale.",
    icon: (
      <Icon>
        <path d="M12 4L21.5 19.5H2.5Z" />
        <path d="M12 10.5v3.5" />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    title: "Automatic back-in-stock notifications",
    body: "Let shoppers sign up on a sold-out product page and get notified automatically the moment it's restocked.",
    icon: (
      <Icon>
        <path d="M6 8a6 6 0 0 1 12 0c0 3.3 1 5 2 6H4c1-1 2-2.7 2-6Z" />
        <path d="M9.3 19a2.6 2.6 0 0 0 5.4 0" />
      </Icon>
    ),
  },
  {
    title: "Auto-hide & auto-republish",
    body: "Sold-out products are hidden from your storefront automatically, then brought back live the instant they restock.",
    icon: (
      <Icon>
        <path d="M4 12a8 8 0 0 1 13.3-6" />
        <path d="M17 3v4h-4" />
        <path d="M20 12a8 8 0 0 1-13.3 6" />
        <path d="M7 21v-4h4" />
      </Icon>
    ),
  },
  {
    title: "Per-product thresholds & filtering",
    body: "Set a global low-stock threshold store-wide, fine-tune it per product, or scope monitoring by collection and tag.",
    icon: (
      <Icon>
        <path d="M4 6h16" />
        <circle cx="9" cy="6" r="1.8" fill="currentColor" stroke="none" />
        <path d="M4 12h16" />
        <circle cx="15" cy="12" r="1.8" fill="currentColor" stroke="none" />
        <path d="M4 18h16" />
        <circle cx="7" cy="18" r="1.8" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    title: "Stock-out predictions",
    body: "See which products are projected to sell out within 7 days, based on your real sales velocity.",
    icon: (
      <Icon>
        <path d="M4 17l4-4 3.5 2.5L16 9" />
        <path d="M16 9l4-3" strokeDasharray="2.5 2.5" />
        <circle cx="20" cy="6" r="1.3" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    title: "Analytics dashboard",
    body: "Track alert history, stock-out trends, and webhook health across your catalog — plus daily or weekly digest emails.",
    icon: (
      <Icon>
        <rect x="4" y="10" width="3.2" height="9" rx="0.6" fill="currentColor" stroke="none" />
        <rect x="10.4" y="5" width="3.2" height="14" rx="0.6" fill="currentColor" stroke="none" />
        <rect x="16.8" y="13" width="3.2" height="6" rx="0.6" fill="currentColor" stroke="none" />
      </Icon>
    ),
  },
  {
    title: "Klaviyo integration",
    body: "Send low-stock and back-in-stock events straight into Klaviyo to power real marketing flows and segments.",
    icon: (
      <Icon>
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="12" r="3" />
        <path d="M9 12h6" />
      </Icon>
    ),
  },
  {
    title: "Native Shopify Flow triggers",
    body: "Build custom automations on low-stock, out-of-stock, or restock events — no code required.",
    icon: (
      <Icon>
        <circle cx="6" cy="6" r="1.8" />
        <circle cx="18" cy="6" r="1.8" />
        <circle cx="12" cy="18" r="1.8" />
        <path d="M7.4 7.6L10.8 16" />
        <path d="M16.6 7.6L13.2 16" />
      </Icon>
    ),
  },
  {
    title: "Outbound webhooks",
    body: "Pipe every alert into Zapier, Make, or your own ERP the moment stock changes.",
    icon: (
      <Icon>
        <rect x="3" y="6" width="8" height="12" rx="1.4" />
        <path d="M13.5 12h6" />
        <path d="M17 8.5l3 3.5-3 3.5" />
      </Icon>
    ),
  },
];

export function LandingFeatures() {
  return (
    <section id="features" className="sa-features">
      <h2 className="sa-sectionHeading">Everything you need to stop stockouts</h2>
      <div className="sa-featureGrid">
        {FEATURES.map((f) => (
          <div key={f.title} className="sa-featureCard">
            <div className="sa-featureIcon">{f.icon}</div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
