import { Form, Link } from "react-router";

const FILTER_TABS = [
  { key: "all",           label: "All Products" },
  { key: "out_of_stock",  label: "Out of Stock" },
  { key: "low_stock",     label: "Low Stock" },
  { key: "tracked",       label: "Tracked" },
  { key: "not_tracked",   label: "Not Tracked" },
];

export function ProductsToolbar({ search, filter, buildUrl, onExportCsv, exporting }: {
  search: string;
  filter: string;
  buildUrl: (params: Record<string, string | null>) => string;
  onExportCsv: () => void;
  exporting: boolean;
}) {
  return (
    <>
      <Form method="get" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input type="hidden" name="filter" value={filter} />
        <input
          name="search"
          defaultValue={search}
          placeholder="Search by title…"
          style={{ flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 14 }}
          aria-label="Search products"
        />
        <button type="submit" style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
          Search
        </button>
        {search && (
          <Link to={`/app/products${filter !== "all" ? `?filter=${filter}` : ""}`}
            style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", textDecoration: "none", fontSize: 14, color: "#374151", lineHeight: "1.5" }}>
            Clear
          </Link>
        )}
      </Form>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginBottom: 0 }}>
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e5e7eb", flex: 1 }}>
          {FILTER_TABS.map((tab) => (
            <Link
              key={tab.key}
              to={buildUrl({ filter: tab.key === "all" ? null : tab.key, after: null, prev: null })}
              style={{
                padding: "6px 14px", fontSize: 13, textDecoration: "none", whiteSpace: "nowrap",
                fontWeight: filter === tab.key || (tab.key === "all" && filter === "all") ? 600 : 400,
                color: filter === tab.key || (tab.key === "all" && filter === "all") ? "#111827" : "#6b7280",
                borderBottom: filter === tab.key || (tab.key === "all" && filter === "all") ? "2px solid #111827" : "2px solid transparent",
              }}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <button
          onClick={onExportCsv}
          disabled={exporting}
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 6, border: "1px solid #d1d5db",
            background: "#fff", color: "#374151", fontSize: 13,
            cursor: exporting ? "not-allowed" : "pointer",
            opacity: exporting ? 0.7 : 1,
            whiteSpace: "nowrap", marginBottom: 1,
          }}
        >
          {exporting ? (
            <span style={{
              width: 12, height: 12, borderRadius: "50%",
              border: "2px solid #d1d5db", borderTopColor: "#374151",
              animation: "btn-spin 0.6s linear infinite", flexShrink: 0,
            }} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          )}
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
      </div>
    </>
  );
}
