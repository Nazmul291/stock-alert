import { Form } from "react-router";

export function DangerZoneSection() {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Danger Zone">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", marginBottom: 2 }}>Reset all product data</div>
            <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
              Clears synced inventory and alert history. Your notification settings are kept. This cannot be undone.
            </p>
          </div>
          <Form
            method="post"
            onSubmit={(e) => { if (!confirm("Reset all product data? This cannot be undone.")) e.preventDefault(); }}
          >
            <input type="hidden" name="intent" value="reset" />
            <button
              type="submit"
              style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}
            >
              Reset Product Data
            </button>
          </Form>
        </div>
      </s-section>
    </div>
  );
}
