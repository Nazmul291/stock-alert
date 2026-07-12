import { fieldLabel, inputStyle, helpText } from "./IntegrationControls";

const MONITORING_FILTER_OPTIONS = [
  { value: "all",        label: "All products",        desc: "Monitor every product in your store." },
  { value: "collection", label: "Specific collection", desc: "Only products in a chosen collection." },
  { value: "tags",       label: "Product tags",        desc: "Only products with specific tags." },
];

export function MonitoringScopeSection({
  monitoringFilter, monitoringCollectionId, monitoringTags,
  onMonitoringFilterChange, onMonitoringCollectionIdChange, onMonitoringTagsChange,
}: {
  monitoringFilter: string;
  monitoringCollectionId: string;
  monitoringTags: string;
  onMonitoringFilterChange: (v: string) => void;
  onMonitoringCollectionIdChange: (v: string) => void;
  onMonitoringTagsChange: (v: string) => void;
}) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Monitoring Scope">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Choose which products Stock Alert tracks. Changes take effect on the next sync.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {MONITORING_FILTER_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                padding: "12px 14px", borderRadius: 8,
                border: `1.5px solid ${monitoringFilter === opt.value ? "#4f46e5" : "#e5e7eb"}`,
                background: monitoringFilter === opt.value ? "#eef2ff" : "#fff",
                transition: "border-color 0.15s, background 0.15s",
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: "50%",
                border: `2px solid ${monitoringFilter === opt.value ? "#4f46e5" : "#d1d5db"}`,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                {monitoringFilter === opt.value && (
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4f46e5" }} />
                )}
              </div>
              <input
                type="radio"
                name="_monitoringFilterRadio"
                value={opt.value}
                checked={monitoringFilter === opt.value}
                onChange={() => onMonitoringFilterChange(opt.value)}
                style={{ display: "none" }}
              />
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: monitoringFilter === opt.value ? "#4338ca" : "#111827" }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        {monitoringFilter === "collection" && (
          <div>
            <label style={fieldLabel}>Collection ID</label>
            <input
              type="text"
              name="monitoringCollectionId"
              value={monitoringCollectionId}
              onChange={(e) => onMonitoringCollectionIdChange(e.target.value)}
              placeholder="e.g. 123456789"
              style={inputStyle()}
            />
            <p style={helpText}>Find the ID in your Shopify admin URL: <code>/collections/[ID]</code></p>
          </div>
        )}

        {monitoringFilter === "tags" && (
          <div>
            <label style={fieldLabel}>Tags (comma-separated)</label>
            <input
              type="text"
              name="monitoringTags"
              value={monitoringTags}
              onChange={(e) => onMonitoringTagsChange(e.target.value)}
              placeholder="e.g. featured, sale, new-arrivals"
              style={inputStyle()}
            />
            <p style={helpText}>Products with <em>any</em> of these tags will be monitored.</p>
          </div>
        )}

        {monitoringFilter !== "all" && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
            Save settings and run <strong>Sync Products</strong> on the Products page to apply the new scope.
          </div>
        )}
      </s-section>
    </div>
  );
}
