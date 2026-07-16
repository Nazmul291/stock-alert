export function SuppliersUpsellCard() {
  return (
    <s-section heading="Suppliers & Purchase Orders">
      <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
        <p style={{ fontSize: 16, marginBottom: 8, color: "#111827", fontWeight: 600 }}>
          Suppliers are an Enterprise plan feature.
        </p>
        <p style={{ fontSize: 14, marginBottom: 20 }}>
          Assign suppliers to products, generate purchase orders from your stockout forecast, and track receiving — all included on Enterprise.
        </p>
        {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
        <s-button variant="primary" href="/app/billing" suppressHydrationWarning>Upgrade to Enterprise</s-button>
      </div>
    </s-section>
  );
}
