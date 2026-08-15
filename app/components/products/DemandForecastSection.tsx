import type { ReactNode } from "react";
import { useSSEData } from "../../hooks/use-sse-data";
import { SalesVelocityBadge } from "./SalesVelocityBadge";
import { StockOutBadge } from "./StockOutBadge";
import type { ProductDemandForecast } from "../../lib/product-detail.server";

type ForecastPoint = { date: string; stockLevel: number };
type ForecastStreamData = {
  history: ForecastPoint[];
  forecast: ForecastPoint[];
  stockOutDate: string | null;
  currentQuantity: number;
  avgDailySales: number | null;
};

function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function statCard(label: string, value: ReactNode) {
  return (
    <div key={label} style={{ flex: 1, minWidth: 130, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#111827" }}>{value}</div>
    </div>
  );
}

// Hand-rolled SVG (same approach as AlertSparkline.tsx — no charting library
// in this codebase), viewBox-scaled rather than fixed-pixel since this needs
// a wider date range and two series. `history` is the reconstructed
// (estimated) stock level; `forecast` starts at the same point (today) so
// the two lines connect visually with no gap.
function ForecastChart({ history, forecast, stockOutDate }: { history: ForecastPoint[]; forecast: ForecastPoint[]; stockOutDate: string | null }) {
  const all = [...history, ...forecast];
  if (all.length < 2) {
    return <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>Not enough sales history yet to chart.</p>;
  }

  const W = 640;
  const H = 200;
  const PAD_L = 34;
  const PAD_R = 10;
  const PAD_T = 24;
  const PAD_B = 24;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const maxY = Math.max(...all.map((p) => p.stockLevel), 1);
  const n = history.length + forecast.length - 1; // forecast[0] overlaps history's last point
  const xScale = (i: number) => PAD_L + (i / Math.max(1, n)) * plotW;
  const yScale = (v: number) => PAD_T + (1 - v / maxY) * plotH;

  const historyPath = history.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(1)} ${yScale(p.stockLevel).toFixed(1)}`).join(" ");
  const forecastStartIndex = history.length - 1;
  const forecastPath = forecast.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(forecastStartIndex + i).toFixed(1)} ${yScale(p.stockLevel).toFixed(1)}`).join(" ");

  const todayX = xScale(forecastStartIndex);
  const stockOutForecastIndex = stockOutDate ? forecast.findIndex((p) => p.date === stockOutDate) : -1;
  const stockOutX = stockOutForecastIndex >= 0 ? xScale(forecastStartIndex + stockOutForecastIndex) : null;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 6 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6b7280" }}>
          <span style={{ width: 10, height: 2, background: "#059669", display: "inline-block" }} /> Estimated stock level
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#6b7280" }}>
          <span style={{ width: 10, height: 2, background: "#4f46e5", display: "inline-block", borderTop: "2px dashed #4f46e5" }} /> Forecast
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 200, display: "block", overflow: "visible" }}>
        <line x1={PAD_L} y1={yScale(0)} x2={W - PAD_R} y2={yScale(0)} stroke="#e5e7eb" strokeWidth={1} />
        <text x={2} y={yScale(0) + 3} fontSize={9} fill="#9ca3af">0</text>
        <text x={2} y={yScale(maxY) + 3} fontSize={9} fill="#9ca3af">{Math.round(maxY)}</text>

        <line x1={todayX} y1={PAD_T} x2={todayX} y2={H - PAD_B} stroke="#9ca3af" strokeWidth={1} strokeDasharray="2,2" />
        <text x={todayX} y={PAD_T - 8} fontSize={9} fill="#6b7280" textAnchor="middle">Forecast starts</text>

        {stockOutX !== null && stockOutDate && (
          <>
            <line x1={stockOutX} y1={PAD_T} x2={stockOutX} y2={H - PAD_B} stroke="#dc2626" strokeWidth={1} strokeDasharray="2,2" />
            <text x={stockOutX} y={H - 6} fontSize={9} fill="#dc2626" textAnchor="middle">Stock out {formatShortDate(stockOutDate)}</text>
          </>
        )}

        <path d={historyPath} fill="none" stroke="#059669" strokeWidth={2} />
        <path d={forecastPath} fill="none" stroke="#4f46e5" strokeWidth={2} strokeDasharray="5,4" />

        <text x={PAD_L} y={H - 6} fontSize={9} fill="#9ca3af" textAnchor="start">{formatShortDate(history[0].date)}</text>
      </svg>
    </div>
  );
}

export function DemandForecastSection({
  productId,
  demandForecast,
  onCreatePurchaseOrder,
}: {
  productId: string;
  demandForecast: ProductDemandForecast | null;
  onCreatePurchaseOrder: () => void;
}) {
  // Lazy, fetched only once this section is actually rendered (Enterprise
  // plans only — demandForecast is null otherwise) — the extra Shopify
  // Orders round-trip never blocks the main product-detail page load.
  const { data, error } = useSSEData<ForecastStreamData>(
    demandForecast ? `/api/product-forecast-stream?productId=${productId}` : null,
  );

  if (!demandForecast) return null;

  const { avgDailySales, stockOutDays, recommendedQuantity, orderByDate } = demandForecast;

  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Demand Forecast">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {statCard("Sales Velocity", <SalesVelocityBadge unitsPerDay={avgDailySales} />)}
          {statCard("Days of Stock Left", <StockOutBadge days={stockOutDays} />)}
          {statCard("Recommended Reorder", `${recommendedQuantity} unit${recommendedQuantity === 1 ? "" : "s"}`)}
          {statCard("Order By", orderByDate ? formatShortDate(orderByDate) : "—")}
        </div>

        {recommendedQuantity > 0 && (
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <span style={{ fontWeight: 700, color: "#3730a3", fontSize: 14 }}>Recommended Reorder</span>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: "#4338ca" }}>
                Place a purchase order for {recommendedQuantity} unit{recommendedQuantity === 1 ? "" : "s"}
                {orderByDate ? ` by ${formatShortDate(orderByDate)}` : ""} to avoid a stockout.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreatePurchaseOrder}
              style={{ fontSize: 13, fontWeight: 600, color: "#3730a3", whiteSpace: "nowrap", border: "1px solid #c7d2fe", borderRadius: 6, padding: "6px 12px", background: "#fff", cursor: "pointer" }}
            >
              Create purchase order →
            </button>
          </div>
        )}

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Sales &amp; Forecast</span>
            <span
              title="Estimated stock level is reconstructed backward from today's known quantity using recent daily sales — a restock during this window won't be reflected, so treat it as an estimate, not an exact history."
              style={{ cursor: "help", color: "#9ca3af", fontSize: 12 }}
            >
              ⓘ
            </span>
          </div>
          {error ? (
            <p style={{ fontSize: 13, color: "#991b1b", margin: 0 }}>Couldn&apos;t load sales history: {error}</p>
          ) : !data ? (
            <div className="skeleton-text" style={{ width: "100%", height: 200, borderRadius: 8 }} />
          ) : (
            <ForecastChart history={data.history} forecast={data.forecast} stockOutDate={data.stockOutDate} />
          )}
        </div>
      </s-section>
    </div>
  );
}
