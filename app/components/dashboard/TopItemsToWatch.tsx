import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";
import { useDashboardStore } from "../../stores/dashboard-store";
import { StatusPill } from "../StatusPill";

// 14-day runway reference for the progress bar — not a hard threshold
// anywhere else in the app, just a reasonable scale so "7 days left" reads
// as roughly half a bar and "1 day left" reads as nearly empty.
const RUNWAY_REFERENCE_DAYS = 14;
// Mockup shows exactly 4 rows — the underlying query still fetches 8 (see
// dashboard-data.server.ts), "View all" covers the rest.
const VISIBLE_ROWS = 4;

const PLACEHOLDER_ROWS = Array.from({ length: VISIBLE_ROWS }, (_, i) => ({
  productId: `skeleton-${i}`,
  productTitle: "Product name",
  sku: null as string | null,
  currentQuantity: 0,
  inventoryStatus: "low_stock",
  stockOutDays: null as number | null,
  imageUrl: null as string | null,
  imageAlt: null as string | null,
}));

// Replaces ProductsAtRiskSection — same atRiskProducts data/ranking (already
// prioritized out-of-stock-first, worst-quantity-first server-side). Card
// chrome + heading live in app._index.tsx; this renders just the row list.
// Row layout: product photo (or a generic package-icon placeholder when no
// image) + title on the left, an inline stock-runway progress bar, and a
// colored "N days left" pill on the right.
export function TopItemsToWatch() {
  const navigate = useShopAwareNavigate();
  const loading = useDashboardStore((s) => s.data === null);
  const products = useDashboardStore((s) => s.data?.atRiskProducts) ?? [];
  const rows = (loading ? PLACEHOLDER_ROWS : products).slice(0, VISIBLE_ROWS);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.map((p) => {
        const isOut = p.inventoryStatus === "out_of_stock";
        const href = `/app/products/${p.productId}`;

        // stockOutDays is null whenever there's no sales-velocity data to
        // project from (no 30-day order history yet) — that's common on a
        // fresh/dev shop, not an error state. Rather than an invisible
        // 0%-width bar and a bare "—", fall back to the same status the
        // rest of the app already shows (Low Stock/Out of Stock): a
        // severity-based bar (full for out-of-stock, half for low-stock —
        // not a day-count claim) and a status-labeled pill, so the row
        // never reads as broken.
        const hasPrediction = p.stockOutDays !== null;
        const runwayFrac = hasPrediction ? Math.min(1, p.stockOutDays! / RUNWAY_REFERENCE_DAYS) : isOut ? 1 : 0.5;
        const isCritical = isOut || p.stockOutDays === 0;
        const barColor = isCritical ? "#ee4f4f" : runwayFrac < 0.5 ? "#f0a12a" : "#27ae72";
        const daysLabel = hasPrediction ? `${p.stockOutDays} day${p.stockOutDays === 1 ? "" : "s"} left` : isOut ? "Out of Stock" : "Low Stock";
        const daysBg = isCritical ? "#fdeaea" : runwayFrac < 0.5 ? "#fdf1dd" : "#e2f5ea";
        const daysColor = isCritical ? "#d63c3c" : runwayFrac < 0.5 ? "#c97d10" : "#1f9a63";
        return (
          <div
            key={p.productId}
            role="button" tabIndex={0}
            onClick={() => !loading && navigate(href)}
            onKeyDown={(e) => !loading && e.key === "Enter" && navigate(href)}
            style={{ display: "flex", alignItems: "center", gap: 12, cursor: loading ? "default" : "pointer" }}
          >
            {p.imageUrl ? (
              <img src={p.imageUrl} alt={p.imageAlt ?? ""} width={44} height={44} loading="lazy"
                style={{ borderRadius: 12, objectFit: "cover", border: "1px solid #ecebf3", flexShrink: 0 }} />
            ) : (
              <div className={loading ? "skeleton-text" : undefined} style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: "#f2f1f7", border: "1px solid #ecebf3", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {!loading && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c2c0d2" strokeWidth="1.7" strokeLinejoin="round">
                    <path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" />
                  </svg>
                )}
              </div>
            )}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <span
                className={loading ? "skeleton-text" : undefined}
                title={p.productTitle ?? undefined}
                style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700, fontSize: 13.5, color: "#26253a" }}
              >
                {p.productTitle ?? "—"}
              </span>
              <div title={hasPrediction ? `~${p.stockOutDays}d of stock left` : daysLabel} style={{ height: 5, borderRadius: 99, background: "#f0eff5", overflow: "hidden" }}>
                <div className={loading ? "skeleton-text" : undefined} style={{ width: `${runwayFrac * 100}%`, height: "100%", background: barColor, borderRadius: 99 }} />
              </div>
            </div>
            <StatusPill
              className={loading ? "skeleton-text" : undefined}
              label={daysLabel}
              bg={daysBg}
              color={daysColor}
              style={{ flexShrink: 0, borderRadius: 9, fontSize: 11.5, fontWeight: 700, padding: "6px 10px" }}
            />
          </div>
        );
      })}
    </div>
  );
}
