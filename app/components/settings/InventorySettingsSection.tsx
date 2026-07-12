import { Toggle, inputStyle, fieldLabel, helpText } from "../IntegrationControls";

const THRESHOLD_OPTIONS = [1, 2, 3, 5, 10, 15, 20, 25, 50];

export function InventorySettingsSection({
  canAutoRepublish, autoHideEnabled, autoRepublishEnabled, onAutoHideChange, onAutoRepublishChange,
  lowStockThreshold, lowStockError, supplierLeadTimeDays,
}: {
  canAutoRepublish: boolean;
  autoHideEnabled: boolean;
  autoRepublishEnabled: boolean;
  onAutoHideChange: (v: boolean) => void;
  onAutoRepublishChange: (v: boolean) => void;
  lowStockThreshold: number;
  lowStockError?: string;
  supplierLeadTimeDays: number;
}) {
  return (
    <s-section heading="Inventory Settings">
      {!canAutoRepublish && (
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>Some features require the Professional plan.</span>
          <s-link href="/app/billing">Upgrade to Pro →</s-link>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <Toggle
          label="Auto-hide sold-out products"
          description="Products with zero inventory are automatically unpublished from your store."
          checked={autoHideEnabled}
          onChange={onAutoHideChange}
        />
        <Toggle
          label="Auto-republish when restocked"
          description={!canAutoRepublish ? "Requires Professional plan." : "Products are automatically republished when inventory is restored."}
          checked={autoRepublishEnabled && canAutoRepublish}
          disabled={!canAutoRepublish}
          onChange={onAutoRepublishChange}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
        <div>
          <label style={fieldLabel}>Low stock threshold</label>
          <select
            name="lowStockThreshold"
            defaultValue={lowStockThreshold}
            style={{ ...inputStyle(!!lowStockError), width: "auto", minWidth: 120 }}
          >
            {THRESHOLD_OPTIONS.map((v) => (
              <option key={v} value={v}>{v} {v === 1 ? "item" : "items"}</option>
            ))}
          </select>
          {lowStockError
            ? <p style={{ ...helpText, color: "#dc2626" }}>{lowStockError}</p>
            : <p style={helpText}>Alert when inventory falls below this amount.</p>}
        </div>

        <div>
          <label style={fieldLabel}>Supplier lead time</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="number"
              name="supplierLeadTimeDays"
              defaultValue={supplierLeadTimeDays}
              min={1}
              max={90}
              style={{ ...inputStyle(), width: 80 }}
            />
            <span style={{ fontSize: 14, color: "#374151" }}>days</span>
          </div>
          <p style={helpText}>Used to calculate "Reorder By" dates on the Products page.</p>
        </div>
      </div>
    </s-section>
  );
}
