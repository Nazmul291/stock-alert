import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { StatusPill } from "../StatusPill";

export type ForecastRuleRow = {
  id: string;
  name: string;
  enabled: boolean;
  scopeType: string;
  scopeValue: string;
  basis: string;
  leadTimeDays: number | null;
  safetyStockDays: number | null;
  minStockLevel: number | null;
  seasonStart: number | null;
  seasonEnd: number | null;
  priority: number;
};

type ActionResult = { success: boolean; error?: string; intent?: string };

const SCOPE_LABELS: Record<string, string> = {
  product: "Product",
  collection: "Collection",
  vendor: "Vendor",
  tag: "Tag",
};
// Mirrors SCOPE_SPECIFICITY in forecast-mode.ts — shown so a merchant can see
// at a glance which rule would win.
const SCOPE_ORDER = ["product", "collection", "vendor", "tag"];

const inputStyle = { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box" as const };
const labelStyle = { display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 };

function monthDayToInput(v: number | null): string {
  if (v === null) return "";
  return `${String(Math.floor(v / 100)).padStart(2, "0")}-${String(v % 100).padStart(2, "0")}`;
}
function monthDayLabel(v: number | null): string {
  if (v === null) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[Math.floor(v / 100) - 1] ?? "?"} ${v % 100}`;
}

export function ForecastRulesList({
  rules, forecastMode, vendors, tags, collectionsSynced,
}: {
  rules: ForecastRuleRow[];
  forecastMode: string;
  vendors: string[];
  tags: string[];
  collectionsSynced: number;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [editing, setEditing] = useState<ForecastRuleRow | "new" | null>(null);
  const busy = fetcher.state !== "idle";

  const sorted = [...rules].sort((a, b) => {
    const sa = SCOPE_ORDER.indexOf(a.scopeType);
    const sb = SCOPE_ORDER.indexOf(b.scopeType);
    if (sa !== sb) return sa - sb;
    return b.priority - a.priority;
  });

  return (
    <>
      {/* Rules only do anything in custom mode — say so rather than letting a
          merchant carefully build rules that are silently never consulted. */}
      {forecastMode !== "custom" && (
        <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fffaf2", border: "1px solid #f6e6cd", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
          These rules are only applied when your forecast mode is set to <strong>Custom</strong>. Your store is
          currently on <strong>{forecastMode === "classic" ? "Classic" : "Smart"}</strong> mode —
          change it in <s-link href="/app/settings">Settings</s-link>.
        </div>
      )}

      {fetcher.data && !fetcher.data.success && (
        <div style={{ marginBottom: 16, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", color: "#991b1b", fontSize: 13 }}>
          {fetcher.data.error}
        </div>
      )}

      <s-section heading="Rules">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 14 }}>
          When several rules match one product, the most specific scope wins (Product → Collection → Vendor → Tag).
          A rule limited to a season beats an all-year rule on the same scope while it&apos;s active.
        </p>

        {sorted.length === 0 ? (
          <p style={{ fontSize: 13, color: "#9ca3af" }}>No rules yet. Products fall back to Smart Mode.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  {["Rule", "Applies to", "Forecast", "Season", "Priority", ""].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f3f4f6", opacity: r.enabled ? 1 : 0.5 }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "#111827" }}>
                      {r.name}
                      {!r.enabled && <StatusPill label="Off" bg="#f3f4f6" color="#6b7280" style={{ marginLeft: 8 }} />}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>
                      <span style={{ color: "#9ca3af" }}>{SCOPE_LABELS[r.scopeType] ?? r.scopeType}:</span> {r.scopeValue}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#374151" }}>
                      {r.basis === "fixed"
                        ? `Fixed level ${r.minStockLevel ?? "—"}`
                        : `Velocity${r.safetyStockDays !== null ? ` +${r.safetyStockDays}d safety` : ""}${r.leadTimeDays !== null ? `, ${r.leadTimeDays}d lead` : ""}`}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>
                      {r.seasonStart !== null && r.seasonEnd !== null
                        ? `${monthDayLabel(r.seasonStart)} – ${monthDayLabel(r.seasonEnd)}`
                        : "All year"}
                    </td>
                    <td style={{ padding: "10px 12px", color: "#6b7280" }}>{r.priority}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => setEditing(r)} disabled={busy}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        Edit
                      </button>
                      <button type="button" disabled={busy}
                        onClick={() => fetcher.submit({ intent: "toggle_rule", id: r.id }, { method: "post" })}
                        style={{ marginLeft: 6, padding: "4px 10px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        {r.enabled ? "Disable" : "Enable"}
                      </button>
                      <button type="button" disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Delete rule "${r.name}"?`)) return;
                          fetcher.submit({ intent: "delete_rule", id: r.id }, { method: "post" });
                        }}
                        style={{ marginLeft: 6, padding: "4px 10px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fff", color: "#991b1b", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={() => setEditing("new")} disabled={busy}
            style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Add Rule
          </button>
        </div>
      </s-section>

      {editing && (
        <RuleEditor
          rule={editing === "new" ? null : editing}
          vendors={vendors}
          tags={tags}
          collectionsSynced={collectionsSynced}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RuleEditor({
  rule, vendors, tags, collectionsSynced, onClose,
}: {
  rule: ForecastRuleRow | null;
  vendors: string[];
  tags: string[];
  collectionsSynced: number;
  onClose: () => void;
}) {
  const fetcher = useFetcher<ActionResult>();
  const [scopeType, setScopeType] = useState(rule?.scopeType ?? "tag");
  const [basis, setBasis] = useState(rule?.basis ?? "velocity");
  const saving = fetcher.state !== "idle";

  // Close once the save round-trips successfully. In an effect, not during
  // render — same pattern as SupplierFormModal, with the same closedRef
  // guard so a re-render before unmount can't fire onClose twice.
  const closedRef = useRef(false);
  useEffect(() => {
    if (fetcher.state !== "idle" || closedRef.current) return;
    if (fetcher.data?.success && fetcher.data.intent === "save_rule") {
      closedRef.current = true;
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.state, fetcher.data]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#111827" }}>{rule ? "Edit Rule" : "Add Rule"}</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <fetcher.Form method="post" style={{ padding: "20px 24px 24px" }}>
          <input type="hidden" name="intent" value="save_rule" />
          {rule && <input type="hidden" name="id" value={rule.id} />}

          {fetcher.data && !fetcher.data.success && (
            <div style={{ marginBottom: 14, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", color: "#991b1b", fontSize: 13 }}>
              {fetcher.data.error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ruleName" style={labelStyle}>Rule name *</label>
            <input id="ruleName" type="text" name="name" required defaultValue={rule?.name ?? ""} placeholder="e.g. Holiday buffer for winter gear" style={inputStyle} />
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="ruleScopeType" style={labelStyle}>Applies to *</label>
              <select id="ruleScopeType" name="scopeType" value={scopeType} onChange={(e) => setScopeType(e.target.value)} style={inputStyle}>
                <option value="product">Specific product</option>
                <option value="collection">Collection</option>
                <option value="vendor">Vendor</option>
                <option value="tag">Product tag</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="ruleScopeValue" style={labelStyle}>
                {scopeType === "product" ? "Product ID *" : scopeType === "collection" ? "Collection ID *" : scopeType === "vendor" ? "Vendor *" : "Tag *"}
              </label>
              <input
                id="ruleScopeValue" type="text" name="scopeValue" required
                defaultValue={rule?.scopeValue ?? ""}
                list={scopeType === "vendor" ? "vendorOptions" : scopeType === "tag" ? "tagOptions" : undefined}
                placeholder={scopeType === "product" ? "e.g. 8581755470016" : scopeType === "collection" ? "e.g. 123456789" : ""}
                style={inputStyle}
              />
              <datalist id="vendorOptions">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="tagOptions">{tags.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          </div>

          {/* Both of these scopes depend on data that only lands on a sync —
              saying so up front beats a rule that silently matches nothing. */}
          {scopeType === "vendor" && vendors.length === 0 && (
            <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12.5, color: "#92400e" }}>
              No vendors synced yet. Run <s-link href="/app/products">Sync Products</s-link> first, or this rule
              won&apos;t match anything.
            </div>
          )}
          {scopeType === "collection" && collectionsSynced === 0 && (
            <div style={{ marginBottom: 14, padding: "10px 14px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12.5, color: "#92400e" }}>
              Collection membership is refreshed nightly. A new collection rule won&apos;t match anything until that
              runs.
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label htmlFor="ruleBasis" style={labelStyle}>Forecast basis *</label>
            <select id="ruleBasis" name="basis" value={basis} onChange={(e) => setBasis(e.target.value)} style={inputStyle}>
              <option value="velocity">Velocity — scale with this product&apos;s sales rate</option>
              <option value="fixed">Fixed level — a flat stock level, no sales history needed</option>
            </select>
          </div>

          {basis === "velocity" ? (
            <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="ruleSafety" style={labelStyle}>Safety stock (days)</label>
                <input id="ruleSafety" type="number" name="safetyStockDays" min={0} max={90} defaultValue={rule?.safetyStockDays ?? ""} placeholder="Store default" style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="ruleLead" style={labelStyle}>Lead time (days)</label>
                <input id="ruleLead" type="number" name="leadTimeDays" min={1} max={90} defaultValue={rule?.leadTimeDays ?? ""} placeholder="Supplier default" style={inputStyle} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 14 }}>
              <label htmlFor="ruleMin" style={labelStyle}>Minimum stock level *</label>
              <input id="ruleMin" type="number" name="minStockLevel" min={0} max={100000} defaultValue={rule?.minStockLevel ?? ""} style={inputStyle} />
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="ruleSeasonStart" style={labelStyle}>Season start (MM-DD)</label>
              <input id="ruleSeasonStart" type="text" name="seasonStart" defaultValue={monthDayToInput(rule?.seasonStart ?? null)} placeholder="11-01" pattern="\d{2}-\d{2}" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="ruleSeasonEnd" style={labelStyle}>Season end (MM-DD)</label>
              <input id="ruleSeasonEnd" type="text" name="seasonEnd" defaultValue={monthDayToInput(rule?.seasonEnd ?? null)} placeholder="02-28" pattern="\d{2}-\d{2}" style={inputStyle} />
            </div>
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#9ca3af" }}>
            Leave blank for a rule that applies all year. A window may wrap the new year (e.g. 11-01 to 02-28).
            Evaluated in your store&apos;s notification timezone.
          </p>

          <div style={{ marginBottom: 20 }}>
            <label htmlFor="rulePriority" style={labelStyle}>Priority</label>
            <input id="rulePriority" type="number" name="priority" min={0} max={10000} defaultValue={rule?.priority ?? ""} placeholder="Auto (based on scope)" style={{ ...inputStyle, width: 160 }} />
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
              Only breaks ties between rules of the same scope. Leave blank to let scope specificity decide.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} disabled={saving}
              style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
              Cancel
            </button>
            <button type="submit" disabled={saving}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: saving ? "#9ca3af" : "#111827", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
              {saving ? "Saving…" : rule ? "Save Changes" : "Add Rule"}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}
