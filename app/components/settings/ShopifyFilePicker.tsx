import { useState, useRef, useEffect } from "react";
import { useFetcher } from "react-router";
import { inputStyle } from "../IntegrationControls";

type ShopifyFile = { id: string; url: string; width: number | null; height: number | null; altText: string; mimeType: string };

export function ShopifyFilePicker({
  onSelect, onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const fetcher = useFetcher<{ files: ShopifyFile[]; hasNextPage: boolean; endCursor: string | null }>();
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allFiles, setAllFiles] = useState<ShopifyFile[]>([]);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function load(q: string, cur: string | null, append = false) {
    const params = new URLSearchParams({ search: q });
    if (cur) params.set("cursor", cur);
    fetcher.load(`/app/api/shopify-files?${params}`);
    if (!append) setAllFiles([]);
    setCursor(cur);
  }

  // Initial load
  useEffect(() => { load("", null); }, []);

  // Merge pages
  useEffect(() => {
    if (fetcher.data?.files) {
      setAllFiles((prev) => cursor ? [...prev, ...fetcher.data!.files] : fetcher.data!.files);
    }
  }, [fetcher.data]);

  function handleSearch(q: string) {
    setSearch(q);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => load(q, null), 400);
  }

  const loading = fetcher.state === "loading";

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)",
      zIndex: 99999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 14, width: "100%", maxWidth: 680, maxHeight: "85vh",
        display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>Choose a logo from Shopify Files</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>PNG, JPG, SVG and WebP only</div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 32, height: 32, fontSize: 18, cursor: "pointer", color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ×
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #f3f4f6" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by filename…"
            style={{ ...inputStyle(), maxWidth: 320 }}
            autoFocus
          />
        </div>

        {/* Grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading && allFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Loading files…</div>
          ) : allFiles.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>
              {search ? `No images matching "${search}"` : "No image files found in your Shopify Files."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
              {allFiles.map((file) => (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => { onSelect(file.url); onClose(); }}
                  style={{
                    border: "1.5px solid #e5e7eb", borderRadius: 8, background: "#f9fafb",
                    padding: 8, cursor: "pointer", display: "flex", flexDirection: "column",
                    alignItems: "center", gap: 6, transition: "border-color 0.15s, background 0.15s",
                    textAlign: "center",
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = "#4f46e5"; e.currentTarget.style.background = "#eef2ff"; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f9fafb"; }}
                >
                  <img
                    src={file.url}
                    alt={file.altText || ""}
                    style={{ width: "100%", height: 80, objectFit: "contain", borderRadius: 4 }}
                    loading="lazy"
                  />
                  {file.width && file.height && (
                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{file.width}×{file.height}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {fetcher.data?.hasNextPage && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => load(search, fetcher.data!.endCursor, true)}
                disabled={loading}
                style={{ padding: "8px 20px", borderRadius: 8, border: "1.5px solid #d1d5db", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#374151" }}
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
