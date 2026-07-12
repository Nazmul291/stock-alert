const FLOW_TRIGGERS = [
  { name: "Low stock", desc: "Fires when a product's inventory drops to or below its threshold." },
  { name: "Out of stock", desc: "Fires when a product's inventory reaches zero." },
  { name: "Restock", desc: "Fires when a previously low/out-of-stock product is restocked." },
];

export function FlowIntegrationSection() {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Flow">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Stock Alert publishes three Flow triggers — no setup needed here. Build a workflow in{" "}
          <a href="https://admin.shopify.com/admin/apps/flow" target="_blank" rel="noopener noreferrer" style={{ color: "#1d4ed8" }}>
            Shopify Flow
          </a>{" "}
          and pick one of these as the trigger:
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {FLOW_TRIGGERS.map((t) => (
            <div key={t.name} style={{ display: "flex", alignItems: "flex-start", gap: 10, border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px" }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>⚡</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{t.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </s-section>
    </div>
  );
}
