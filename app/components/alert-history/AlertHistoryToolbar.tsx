import { Link, Form } from "react-router";
import { useAlertHistoryStore, buildAlertHistoryUrl } from "../../stores/alert-history-store";

const TYPE_TABS = [
  { key: "all",          label: "All" },
  { key: "low_stock",    label: "Low Stock" },
  { key: "out_of_stock", label: "Out of Stock" },
  { key: "restock",      label: "Back in Stock" },
];

function ClearAllButton({ total }: { total: number }) {
  return (
    <Form
      method="post"
      onSubmit={(e) => {
        if (!confirm(`Delete all ${total} alert${total !== 1 ? "s" : ""}? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value="clear_all" />
      <button
        type="submit"
        style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap" }}
      >
        Clear All
      </button>
    </Form>
  );
}

export function AlertHistoryToolbar() {
  const typeFilter = useAlertHistoryStore((s) => s.typeFilter);
  const productSearch = useAlertHistoryStore((s) => s.productSearch);
  const page = useAlertHistoryStore((s) => s.page);
  const clearAllTotal = useAlertHistoryStore((s) => s.data?.total ?? null);
  const buildUrl = (overrides: Record<string, string | number | null>) =>
    buildAlertHistoryUrl({ typeFilter, productSearch, page }, overrides);

  return (
    <>
      {/* Top bar: search + clear all — search renders immediately (URL-derived,
          no DB needed); Clear All depends on knowing whether there's anything
          to clear, so it streams in independently once that's known. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <Form method="get" style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
          {typeFilter !== "all" && <input type="hidden" name="type" value={typeFilter} />}
          <input
            name="product"
            defaultValue={productSearch}
            placeholder="Search by product name…"
            style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }}
            aria-label="Search by product name"
          />
          <button type="submit" style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
            Search
          </button>
          {productSearch && (
            <Link
              to={buildUrl({ product: null, page: 1 })}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", textDecoration: "none", fontSize: 14, color: "#374151", lineHeight: "1.5" }}
            >
              Clear
            </Link>
          )}
        </Form>

        {clearAllTotal !== null && clearAllTotal > 0 && <ClearAllButton total={clearAllTotal} />}
      </div>

      {/* Filter tabs — URL-derived, render immediately */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "1px solid #e5e7eb" }}>
        {TYPE_TABS.map((tab) => (
          <Link
            key={tab.key}
            to={buildUrl({ type: tab.key, page: 1, product: null })}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              textDecoration: "none",
              whiteSpace: "nowrap",
              fontWeight: typeFilter === tab.key ? 600 : 400,
              color: typeFilter === tab.key ? "#111827" : "#6b7280",
              borderBottom: typeFilter === tab.key ? "2px solid #111827" : "2px solid transparent",
            }}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </>
  );
}
