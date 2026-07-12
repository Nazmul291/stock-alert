export function ThemeAppEmbedSection() {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Theme App Embed">
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <p style={{ fontSize: 14, color: "#374151", margin: "0 0 12px", lineHeight: 1.6 }}>
              The "Notify Me When Available" button is powered by a <strong>Theme App Embed</strong>.
              It automatically replaces the Add to Cart button on out-of-stock products — no code required.
            </p>
            <ol style={{ fontSize: 14, color: "#374151", margin: 0, paddingLeft: 18, lineHeight: 2 }}>
              <li>Go to <strong>Online Store → Themes → Customize</strong></li>
              <li>Open <strong>App embeds</strong> in the left sidebar</li>
              <li>Toggle on <strong>Back in Stock</strong></li>
              <li>Save — the button is now live on all out-of-stock products</li>
            </ol>
          </div>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "14px 18px", fontSize: 13, color: "#065f46", minWidth: 220 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>What customers see</div>
            <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.8 }}>
              <li>Product info + image in popup</li>
              <li>First name, last name &amp; email form</li>
              <li>One email when the product restocks</li>
              <li>Button changes to ✓ Notified</li>
            </ul>
          </div>
        </div>
      </s-section>
    </div>
  );
}
