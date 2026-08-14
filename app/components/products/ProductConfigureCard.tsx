import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { ProductRow } from "./ProductEditModal";
import type { ProductDetailConfigure } from "../../lib/product-detail.server";
import { UnsavedChangesBar } from "../UnsavedChangesBar";
import { useLiveEventsStore } from "../../stores/live-events-store";
import { SkeletonBlock } from "../Skeleton";

type SaveResult = { success: true; message: string } | { error: string };

export function ProductConfigureCard({
  product,
  configure,
  storeDefaults,
  canPerProductThreshold,
}: {
  product: ProductRow;
  configure: ProductDetailConfigure;
  storeDefaults: { threshold: number; autoHideEnabled: boolean; autoRepublishEnabled: boolean };
  canPerProductThreshold: boolean;
}) {
  const saveFetcher = useFetcher<SaveResult>();
  const saving = saveFetcher.state !== "idle";

  const initial = {
    tracked: product.isTracked,
    monitoring: product.monitoringEnabled,
    autoHide: configure.autoHide ?? storeDefaults.autoHideEnabled,
    autoRepublish: configure.autoRepublish ?? storeDefaults.autoRepublishEnabled,
    customThreshold: configure.customThreshold,
    restockDate: product.expectedRestockDate ?? "",
    manualSales: product.manualDailySales != null ? String(product.manualDailySales) : "",
  };

  const [tracked, setTracked] = useState(initial.tracked);
  const [monitoring, setMonitoring] = useState(initial.monitoring);
  const [autoHide, setAutoHide] = useState(initial.autoHide);
  const [autoRepublish, setAutoRepublish] = useState(initial.autoRepublish);
  const [customThreshold, setCustomThreshold] = useState(initial.customThreshold);
  const [restockDate, setRestockDate] = useState(initial.restockDate);
  const [manualSales, setManualSales] = useState(initial.manualSales);
  const [isDirty, setIsDirty] = useState(false);
  function markDirty() { setIsDirty(true); }

  const bumpLiveEvents = useLiveEventsStore((s) => s.bump);
  useEffect(() => {
    if (saveFetcher.state === "idle" && saveFetcher.data && "success" in saveFetcher.data) {
      setIsDirty(false);
      // This save is the only source of the change (no webhook fires for
      // it) — the SSE-backed page data is stale until told otherwise, so
      // bump the topic locally instead of relying on loader revalidation
      // (which no longer does anything now that the loader only mints a
      // token; see product-detail-store.ts / api.product-detail-stream.ts).
      bumpLiveEvents(["product-detail"]);
    }
  }, [saveFetcher.state, saveFetcher.data, bumpLiveEvents]);

  function handleDiscard() {
    setTracked(initial.tracked);
    setMonitoring(initial.monitoring);
    setAutoHide(initial.autoHide);
    setAutoRepublish(initial.autoRepublish);
    setCustomThreshold(initial.customThreshold);
    setRestockDate(initial.restockDate);
    setManualSales(initial.manualSales);
    setIsDirty(false);
  }

  function handleSave() {
    saveFetcher.submit(
      {
        intent: "configure_product",
        tracked: String(tracked),
        monitoringEnabled: String(monitoring && tracked),
        autoHide: String(autoHide),
        autoRepublish: String(autoRepublish),
        customThreshold,
        customThresholdMetafieldId: configure.customThresholdMetafieldId ?? "",
        expectedRestockDate: restockDate,
        manualDailySales: manualSales,
      },
      { method: "post" },
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 4 }}>
      {isDirty && <div style={{ height: 57 }} />}

      {saveFetcher.data && "error" in saveFetcher.data && (
        <div style={{ marginBottom: 6, background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", color: "#991b1b", fontSize: 13 }}>
          {saveFetcher.data.error}
        </div>
      )}
      {!isDirty && saveFetcher.data && "success" in saveFetcher.data && saveFetcher.state === "idle" && (
        <div style={{ marginBottom: 6, background: "#d1fae5", border: "1px solid #a7f3d0", borderRadius: 6, padding: "8px 12px", color: "#065f46", fontSize: 13 }}>
          {saveFetcher.data.message}
        </div>
      )}

      <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Shopify Tracking</p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: tracked ? "#059669" : "#9ca3af" }}>
              {tracked ? "Shopify is tracking inventory for this product." : "Shopify is not tracking inventory."}
            </p>
          </div>
          <div
            onClick={() => {
              const next = !tracked;
              setTracked(next);
              if (!next) setMonitoring(false);
              markDirty();
            }}
            style={{
              width: 44, height: 24, borderRadius: 12, background: tracked ? "#008060" : "#d1d5db",
              position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer",
            }}
          >
            <div style={{
              position: "absolute", top: 2, left: tracked ? 22 : 2,
              width: 20, height: 20, borderRadius: "50%", background: "#fff",
              transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </div>
        </label>

        {/* Same box as Shopify Tracking above, split by a divider instead of
            its own bordered card — the two are directly related (Monitoring
            is inert until Tracking is on), so nesting them separately just
            added a redundant border. */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e5e7eb", opacity: tracked ? 1 : 0.45 }}>
          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: tracked ? "pointer" : "not-allowed" }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Monitoring</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: monitoring && tracked ? "#059669" : "#9ca3af" }}>
                {!tracked ? "Enable Shopify Tracking first." : monitoring ? "Active — Stock Alert will send alerts for this product." : "Inactive — no alerts will be sent."}
              </p>
            </div>
            <div
              onClick={() => { if (tracked) { setMonitoring(!monitoring); markDirty(); } }}
              style={{
                width: 44, height: 24, borderRadius: 12, background: monitoring && tracked ? "#008060" : "#d1d5db",
                position: "relative", flexShrink: 0, transition: "background .2s", cursor: tracked ? "pointer" : "not-allowed",
              }}
            >
              <div style={{
                position: "absolute", top: 2, left: monitoring && tracked ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%", background: "#fff",
                transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </div>
          </label>
        </div>
      </div>

      {tracked && (
        <div style={{ marginBottom: 12, padding: 14, background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
          <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 13, color: "#374151" }}>Inventory Settings</p>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>Auto-hide sold-out products</p>
                <p style={{ margin: "1px 0 0", fontSize: 12, color: "#9ca3af" }}>Automatically unpublish when stock hits zero</p>
              </div>
              <div
                onClick={() => { setAutoHide((v) => !v); markDirty(); }}
                style={{
                  width: 36, height: 20, borderRadius: 10, background: autoHide ? "#008060" : "#d1d5db",
                  position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer", marginLeft: 12,
                }}
              >
                <div style={{
                  position: "absolute", top: 2, left: autoHide ? 18 : 2,
                  width: 16, height: 16, borderRadius: "50%", background: "#fff",
                  transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
            </label>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>Auto-republish when restocked</p>
                <p style={{ margin: "1px 0 0", fontSize: 12, color: "#9ca3af" }}>Republish automatically when inventory is added</p>
              </div>
              <div
                onClick={() => { setAutoRepublish((v) => !v); markDirty(); }}
                style={{
                  width: 36, height: 20, borderRadius: 10, background: autoRepublish ? "#008060" : "#d1d5db",
                  position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer", marginLeft: 12,
                }}
              >
                <div style={{
                  position: "absolute", top: 2, left: autoRepublish ? 18 : 2,
                  width: 16, height: 16, borderRadius: "50%", background: "#fff",
                  transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                }} />
              </div>
            </label>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>
              Low-Stock Threshold
              {!canPerProductThreshold && (
                <span style={{ marginLeft: 6, fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4 }}>
                  Pro only
                </span>
              )}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="number"
                min="0"
                value={customThreshold}
                onChange={(e) => { setCustomThreshold(e.target.value); markDirty(); }}
                placeholder={`Store default (${storeDefaults.threshold})`}
                disabled={!canPerProductThreshold}
                style={{
                  width: 150, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 10px", fontSize: 13,
                  background: !canPerProductThreshold ? "#f3f4f6" : "#fff",
                  color: !canPerProductThreshold ? "#9ca3af" : "#111827",
                  cursor: !canPerProductThreshold ? "not-allowed" : "text",
                }}
                aria-label="Custom threshold"
              />
              {customThreshold && canPerProductThreshold && (
                <button type="button" onClick={() => { setCustomThreshold(""); markDirty(); }}
                  style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                  Reset to default
                </button>
              )}
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>Alert when inventory falls below this amount</p>
          </div>
        </div>
      )}

      {/* Both forecast-related inputs share one box, divided instead of
          nested separately — same reasoning as Tracking/Monitoring above. */}
      <div style={{ marginBottom: 16, padding: "14px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
        <label htmlFor="pdp-restock-date" style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
          Expected restock date
        </label>
        <input
          id="pdp-restock-date"
          type="date"
          value={restockDate}
          onChange={(e) => { setRestockDate(e.target.value); markDirty(); }}
          style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 10px", fontSize: 13 }}
        />
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
          When do you expect this product to be restocked? Shown on the Back in Stock page.
        </p>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #e5e7eb" }}>
          <label htmlFor="pdp-manual-sales" style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
            Daily sales override
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              id="pdp-manual-sales"
              type="number"
              value={manualSales}
              onChange={(e) => { setManualSales(e.target.value); markDirty(); }}
              min={0}
              step={0.1}
              placeholder={product.manualDailySales == null ? "Auto" : ""}
              style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 10px", fontSize: 13 }}
            />
            <span style={{ fontSize: 13, color: "#374151" }}>units / day</span>
            {manualSales !== "" && (
              <button
                type="button"
                onClick={() => { setManualSales(""); markDirty(); }}
                style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
              >
                Clear
              </button>
            )}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
            Override the auto-calculated rate for new products with no order history. Leave blank to use the average.
          </p>
        </div>
      </div>

      {isDirty && (
        <UnsavedChangesBar saving={saving} onDiscard={handleDiscard} onSave={handleSave} />
      )}
    </div>
  );
}

// Shown in the aside slot instead of the real card while product-detail data
// is still loading. Unlike the rest of this page's skeletons, this can't be
// the real ProductConfigureCard with placeholder props — its form state
// (tracked/monitoring/etc.) is seeded from `product`/`configure` only once,
// on mount, via useState's initial value, so mounting it early with fake
// data would leave it stuck showing that fake state even after real data
// arrives. A shape-only placeholder (SkeletonBlock, no real markup) avoids
// that; the route swaps it for the real card once data lands.
export function ProductConfigureCardSkeleton() {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <SkeletonBlock width={140} height={16} />
      {Array.from({ length: 4 }, (_, i) => (
        <SkeletonBlock key={i} width="100%" height={52} borderRadius={8} />
      ))}
    </div>
  );
}
