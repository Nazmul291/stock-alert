import { useState, useEffect, useRef } from "react";
import { useFetcher } from "react-router";
import { InventorySection } from "./InventorySection";
import type { VariantInventory } from "./InventorySection";
import { canUseFeature } from "../../lib/plan-limits";

export type VariantStatusRow = {
  id: string;
  variantId: string;
  variantTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  inventoryStatus: string;
};

export type ProductRow = {
  id: string | number;
  productId: string;
  productTitle: string;
  sku: string | null;
  currentQuantity: number;
  inventoryStatus: string;
  isHidden: boolean;
  isTracked: boolean;
  monitoringEnabled: boolean;
  imageUrl: string | null;
  imageAlt: string;
  shopifyStatus: string;
  inventoryItemId: string | null;
  stockOutDays?: number | null;
  manualDailySales?: number | null;
  expectedRestockDate?: string | null;
  variants?: VariantStatusRow[];
  variantCount?: number;
  variantsAtRiskCount?: number;
};

type ProductSettings = {
  customThreshold: string;
  customThresholdId: string | null;
  autoHide: boolean | null;
  autoRepublish: boolean | null;
};

// Emitted right after a successful save so the products table can update
// its display instantly instead of waiting on a page reload — the real
// inventory webhook is still the only thing that writes currentQuantity/
// inventoryStatus to the DB (see webhooks.inventory.tsx), this is purely a
// client-side reflection of what was just submitted.
export type OptimisticPatch = {
  monitoringEnabled: boolean;
  expectedRestockDate: string | null;
  manualDailySales: number | null;
  isTracked: boolean;
  // Present only when tracked and inventory data was loaded — per-variant
  // quantity/status keyed by variantId, computed from the same threshold
  // logic the server uses (see webhooks.inventory.tsx's status calc).
  variantPatches?: Record<string, { currentQuantity: number; inventoryStatus: string }>;
};

function statusForQty(qty: number, threshold: number): string {
  return qty <= 0 ? "out_of_stock" : qty <= threshold ? "low_stock" : "in_stock";
}

// Client-safe duplicate of inventory-rollup.server.ts's classifyProductStatus
// (that one is .server.ts and gets stripped from the client bundle) — must
// stay in sync with it. Worst-case status across a product's variants.
export function rollupVariantStatuses(variantStatuses: string[]): string {
  if (variantStatuses.length === 0) return "in_stock";
  if (variantStatuses.every((s) => s === "deactivated")) return "deactivated";
  if (variantStatuses.every((s) => s === "requires_upgrade")) return "requires_upgrade";
  const relevant = variantStatuses.filter((s) => s !== "deactivated" && s !== "requires_upgrade");
  if (relevant.every((s) => s === "out_of_stock")) return "out_of_stock";
  if (relevant.some((s) => s === "out_of_stock" || s === "low_stock")) return "low_stock";
  return "in_stock";
}

const SHOPIFY_STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Unlisted" },
];

type Props = {
  product: ProductRow;
  plan: string;
  threshold: number;
  autoHideEnabled: boolean;
  autoRepublishEnabled: boolean;
  onClose: () => void;
  onSaved?: (patch: OptimisticPatch) => void;
  // Called if the real response turns out to be an error and arrives after
  // the modal has already force-closed (see the 1s close timer below) — the
  // merchant can no longer see the modal's own error banner at that point.
  onSaveError?: (message: string) => void;
};

export function ProductEditModal({ product, plan, threshold, autoHideEnabled, autoRepublishEnabled, onClose, onSaved, onSaveError }: Props) {
  const canPerProductThreshold = canUseFeature(plan, "perProductThresholds");
  const saveFetcher = useFetcher<any>();
  const inventoryFetcher = useFetcher<{ inventoryData?: { variants: VariantInventory[] } | null; inventoryError?: string }>();
  const enableTrackingFetcher = useFetcher<{ enabledInventory?: { variants: VariantInventory[] }; error?: string }>();
  const settingsFetcher = useFetcher<{ productSettings?: ProductSettings | null; settingsError?: string }>();

  const [editStatus, setEditStatus] = useState(product.shopifyStatus ?? "ACTIVE");
  const [editTracked, setEditTracked] = useState(product.isTracked);
  const [editMonitoring, setEditMonitoring] = useState(product.monitoringEnabled);
  const [expandedVariants, setExpandedVariants] = useState<Set<string>>(new Set());
  const [inventoryEdits, setInventoryEdits] = useState<Record<string, string>>({});
  const [editCustomThreshold, setEditCustomThreshold] = useState("");
  const [editAutoHide, setEditAutoHide] = useState(autoHideEnabled);
  const [editAutoRepublish, setEditAutoRepublish] = useState(autoRepublishEnabled);
  const [customThresholdMetafieldId, setCustomThresholdMetafieldId] = useState<string | null>(null);
  const [editRestockDate, setEditRestockDate] = useState(product.expectedRestockDate ?? "");
  const [editManualSales, setEditManualSales] = useState(product.manualDailySales != null ? String(product.manualDailySales) : "");

  // Load inventory and settings on mount
  useEffect(() => {
    if (product.isTracked) {
      inventoryFetcher.load(`/app/products?intent=get_product_inventory&productId=${product.productId}`);
    }
    settingsFetcher.load(`/app/products?intent=get_product_settings&productId=${product.productId}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Populate settings when metafield data arrives
  useEffect(() => {
    const s = settingsFetcher.data?.productSettings;
    if (!s) return;
    setEditCustomThreshold(s.customThreshold ?? "");
    setEditAutoHide(s.autoHide !== null ? s.autoHide : autoHideEnabled);
    setEditAutoRepublish(s.autoRepublish !== null ? s.autoRepublish : autoRepublishEnabled);
    setCustomThresholdMetafieldId(s.customThresholdId);
  }, [settingsFetcher.data]);

  // Closes immediately on a real success, or forcibly after 1s regardless of
  // whether the request has finished — the save almost always succeeds, and
  // the optimistic patch already reflects the change, so there's no reason
  // to make the merchant wait on the round-trip. Guarded so only the first
  // of "real response" / "1s timer" actually closes things.
  const closedRef = useRef(false);
  const forceCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function closeOnce() {
    if (closedRef.current) return;
    closedRef.current = true;
    if (forceCloseTimerRef.current) clearTimeout(forceCloseTimerRef.current);
    onSaved?.(buildOptimisticPatch());
    onClose();
  }

  useEffect(() => {
    if (saveFetcher.state === "submitting" && !forceCloseTimerRef.current && !closedRef.current) {
      forceCloseTimerRef.current = setTimeout(closeOnce, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFetcher.state]);

  useEffect(() => {
    if (saveFetcher.state !== "idle" || !saveFetcher.data) return;
    if ("success" in saveFetcher.data) {
      closeOnce();
    } else if ("error" in saveFetcher.data && closedRef.current) {
      // Already force-closed — the modal's own error banner is gone, so
      // surface it at the page level instead of losing it silently.
      onSaveError?.(saveFetcher.data.error as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveFetcher.state, saveFetcher.data]);

  useEffect(() => {
    return () => { if (forceCloseTimerRef.current) clearTimeout(forceCloseTimerRef.current); };
  }, []);

  function buildOptimisticPatch(): OptimisticPatch {
    const base = {
      monitoringEnabled: editMonitoring && editTracked,
      expectedRestockDate: editRestockDate || null,
      manualDailySales: editManualSales.trim() !== "" && !isNaN(parseFloat(editManualSales)) ? parseFloat(editManualSales) : null,
      isTracked: editTracked,
    };

    if (!editTracked || latestVariants.length === 0) return base;

    const parsedCustom = editCustomThreshold.trim() !== "" ? parseInt(editCustomThreshold) : NaN;
    const effectiveThreshold = canPerProductThreshold && !isNaN(parsedCustom) && parsedCustom >= 0 ? parsedCustom : threshold;

    // Group the edited per-location quantities back into a per-variant total —
    // mirrors the cross-location sum the server treats as a variant's real quantity.
    const totalsByInventoryItemId = new Map<string, number>();
    for (const [key, val] of Object.entries(inventoryEdits)) {
      const [inventoryItemId] = key.split("__");
      const parsed = parseInt(val);
      const qty = isNaN(parsed) || val.trim() === "" ? 0 : Math.max(0, parsed);
      totalsByInventoryItemId.set(inventoryItemId, (totalsByInventoryItemId.get(inventoryItemId) ?? 0) + qty);
    }

    const variantPatches: Record<string, { currentQuantity: number; inventoryStatus: string }> = {};
    for (const v of latestVariants) {
      if (!v.inventoryItemId) continue;
      const qty = totalsByInventoryItemId.get(v.inventoryItemId) ?? 0;
      const variantId = v.id.split("/").pop() as string;
      variantPatches[variantId] = { currentQuantity: qty, inventoryStatus: statusForQty(qty, effectiveThreshold) };
    }

    return { ...base, variantPatches };
  }

  // Initialise edits when inventory data arrives from either fetcher
  useEffect(() => {
    const variants =
      enableTrackingFetcher.data?.enabledInventory?.variants ??
      inventoryFetcher.data?.inventoryData?.variants;
    if (!variants?.length) return;
    const initial: Record<string, string> = {};
    for (const v of variants) {
      if (!v.inventoryItemId) continue;
      for (const loc of v.locations) {
        initial[`${v.inventoryItemId}__${loc.locationId}`] = String(loc.quantity);
      }
    }
    setInventoryEdits(initial);
  }, [enableTrackingFetcher.data, inventoryFetcher.data]);

  const toggleVariant = (id: string) => {
    setExpandedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saving = saveFetcher.state === "submitting";
  const loadingInventory = enableTrackingFetcher.state === "submitting" || inventoryFetcher.state === "loading";

  const latestVariants =
    enableTrackingFetcher.data?.enabledInventory?.variants ??
    inventoryFetcher.data?.inventoryData?.variants ??
    [];

  const inventoryUpdates = Object.entries(inventoryEdits)
    .map(([key, val]) => {
      const parts = key.split("__");
      if (parts.length !== 2) return null;
      const parsed = parseInt(val);
      const quantity = isNaN(parsed) || val.trim() === "" ? 0 : Math.max(0, parsed);
      return { inventoryItemId: parts[0], locationId: parts[1], quantity };
    })
    .filter(Boolean) as Array<{ inventoryItemId: string; locationId: string; quantity: number }>;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 520, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>

        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.imageAlt} width={52} height={52} loading="lazy"
              style={{ borderRadius: 8, objectFit: "cover", border: "1px solid #e5e7eb", flexShrink: 0 }} />
          ) : (
            <div style={{ width: 52, height: 52, borderRadius: 8, background: "#f3f4f6", border: "1px solid #e5e7eb", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 22 }}>
              ▢
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {product.productTitle}
            </p>
            {product.sku && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9ca3af" }}>SKU: {product.sku}</p>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 20, lineHeight: 1, padding: 4 }}>
            ✕
          </button>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {saveFetcher.data && "error" in saveFetcher.data && (
            <div style={{ margin: "12px 24px 0", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 6, padding: "8px 12px", color: "#991b1b", fontSize: 13 }}>
              {saveFetcher.data.error}
            </div>
          )}

          <saveFetcher.Form method="post" style={{ padding: "20px 24px 24px" }}>
            <input type="hidden" name="intent" value="update_product" />
            <input type="hidden" name="productId" value={product.productId} />
            <input type="hidden" name="productTitle" value={product.productTitle ?? ""} />
            <input type="hidden" name="inventoryUpdates" value={JSON.stringify(inventoryUpdates)} />
            <input type="hidden" name="shopifyInventoryItemId" value={latestVariants[0]?.inventoryItemId ?? ""} />

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>
                Product Status
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {SHOPIFY_STATUSES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setEditStatus(s.value)}
                    style={{
                      flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer",
                      border: editStatus === s.value ? "2px solid #111827" : "1px solid #e5e7eb",
                      background: editStatus === s.value ? "#111827" : "#fff",
                      color: editStatus === s.value ? "#fff" : "#374151",
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <input type="hidden" name="shopifyStatus" value={editStatus} />
            </div>

            <div style={{ marginBottom: 12, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Shopify Tracking</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: editTracked ? "#059669" : "#9ca3af" }}>
                    {editTracked ? "Shopify is tracking inventory for this product." : "Shopify is not tracking inventory."}
                  </p>
                </div>
                <div
                  onClick={() => {
                    const next = !editTracked;
                    setEditTracked(next);
                    if (!next) setEditMonitoring(false);
                    if (next) {
                      setExpandedVariants(new Set());
                      setInventoryEdits({});
                      enableTrackingFetcher.submit(
                        { intent: "enable_and_fetch_inventory", productId: product.productId },
                        { method: "post" }
                      );
                    }
                  }}
                  style={{
                    width: 44, height: 24, borderRadius: 12, background: editTracked ? "#008060" : "#d1d5db",
                    position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2, left: editTracked ? 22 : 2,
                    width: 20, height: 20, borderRadius: "50%", background: "#fff",
                    transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </div>
              </label>
              <input type="hidden" name="tracked" value={String(editTracked)} />
            </div>

            <div style={{ marginBottom: editTracked ? 16 : 24, padding: "12px 14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb", opacity: editTracked ? 1 : 0.45 }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: editTracked ? "pointer" : "not-allowed" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: "#374151" }}>Monitoring</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: editMonitoring && editTracked ? "#059669" : "#9ca3af" }}>
                    {!editTracked ? "Enable Shopify Tracking first." : editMonitoring ? "Active — Stock Alert will send alerts for this product." : "Inactive — no alerts will be sent."}
                  </p>
                </div>
                <div
                  onClick={() => { if (editTracked) setEditMonitoring(!editMonitoring); }}
                  style={{
                    width: 44, height: 24, borderRadius: 12, background: editMonitoring && editTracked ? "#008060" : "#d1d5db",
                    position: "relative", flexShrink: 0, transition: "background .2s", cursor: editTracked ? "pointer" : "not-allowed",
                  }}
                >
                  <div style={{
                    position: "absolute", top: 2, left: editMonitoring && editTracked ? 22 : 2,
                    width: 20, height: 20, borderRadius: "50%", background: "#fff",
                    transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </div>
              </label>
              <input type="hidden" name="monitoringEnabled" value={String(editMonitoring && editTracked)} />
            </div>

            {editTracked && (
              <div style={{ marginBottom: 16, padding: "14px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                <p style={{ margin: "0 0 12px", fontWeight: 600, fontSize: 13, color: "#374151" }}>
                  Inventory Settings
                </p>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>Auto-hide sold-out products</p>
                      <p style={{ margin: "1px 0 0", fontSize: 12, color: "#9ca3af" }}>Automatically unpublish when stock hits zero</p>
                    </div>
                    <div
                      onClick={() => setEditAutoHide((v) => !v)}
                      style={{
                        width: 36, height: 20, borderRadius: 10, background: editAutoHide ? "#008060" : "#d1d5db",
                        position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer", marginLeft: 12,
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 2, left: editAutoHide ? 18 : 2,
                        width: 16, height: 16, borderRadius: "50%", background: "#fff",
                        transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </div>
                  </label>
                  <input type="hidden" name="autoHide" value={String(editAutoHide)} />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>Auto-republish when restocked</p>
                      <p style={{ margin: "1px 0 0", fontSize: 12, color: "#9ca3af" }}>Republish automatically when inventory is added</p>
                    </div>
                    <div
                      onClick={() => setEditAutoRepublish((v) => !v)}
                      style={{
                        width: 36, height: 20, borderRadius: 10, background: editAutoRepublish ? "#008060" : "#d1d5db",
                        position: "relative", flexShrink: 0, transition: "background .2s", cursor: "pointer", marginLeft: 12,
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 2, left: editAutoRepublish ? 18 : 2,
                        width: 16, height: 16, borderRadius: "50%", background: "#fff",
                        transition: "left .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }} />
                    </div>
                  </label>
                  <input type="hidden" name="autoRepublish" value={String(editAutoRepublish)} />
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
                      value={editCustomThreshold}
                      onChange={(e) => setEditCustomThreshold(e.target.value)}
                      placeholder={`Store default (${threshold})`}
                      disabled={!canPerProductThreshold}
                      style={{
                        width: 150, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 10px", fontSize: 13,
                        background: !canPerProductThreshold ? "#f3f4f6" : "#fff",
                        color: !canPerProductThreshold ? "#9ca3af" : "#111827",
                        cursor: !canPerProductThreshold ? "not-allowed" : "text",
                      }}
                      aria-label="Custom threshold"
                    />
                    {editCustomThreshold && canPerProductThreshold && (
                      <button type="button" onClick={() => setEditCustomThreshold("")}
                        style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", padding: "4px 6px" }}>
                        Reset to default
                      </button>
                    )}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>Alert when inventory falls below this amount</p>
                  <input type="hidden" name="customThreshold" value={editCustomThreshold} />
                  <input type="hidden" name="customThresholdMetafieldId" value={customThresholdMetafieldId ?? ""} />
                </div>
              </div>
            )}

            {editTracked && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 8 }}>
                  Inventory
                </label>
                <InventorySection
                  variants={latestVariants}
                  loading={loadingInventory}
                  error={inventoryFetcher.data?.inventoryError}
                  edits={inventoryEdits}
                  expanded={expandedVariants}
                  onEdit={(key, val) => setInventoryEdits((prev) => ({ ...prev, [key]: val }))}
                  onToggleExpand={toggleVariant}
                />
                {!loadingInventory && latestVariants.some((v) => v.tracked) && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9ca3af" }}>
                    Updates available quantity at each Shopify location.
                  </p>
                )}
              </div>
            )}

            {/* Expected restock date */}
            <div style={{ marginBottom: 20, padding: "14px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
                Expected restock date
              </label>
              <input
                type="date"
                name="expectedRestockDate"
                value={editRestockDate}
                onChange={(e) => setEditRestockDate(e.target.value)}
                style={{ border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 10px", fontSize: 13 }}
              />
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
                When do you expect this product to be restocked? Shown on the Back in Stock page.
              </p>
            </div>

            {/* Manual velocity override */}
            <div style={{ marginBottom: 20, padding: "14px 16px", background: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
              <label style={{ display: "block", fontWeight: 600, fontSize: 13, color: "#374151", marginBottom: 6 }}>
                Daily sales override
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  name="manualDailySales"
                  value={editManualSales}
                  onChange={(e) => setEditManualSales(e.target.value)}
                  min={0}
                  step={0.1}
                  placeholder={product.manualDailySales == null ? "Auto" : ""}
                  style={{ width: 80, border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 10px", fontSize: 13 }}
                />
                <span style={{ fontSize: 13, color: "#374151" }}>units / day</span>
                {editManualSales !== "" && (
                  <button
                    type="button"
                    onClick={() => setEditManualSales("")}
                    style={{ fontSize: 12, color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                  >
                    Clear
                  </button>
                )}
              </div>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#9ca3af" }}>
                Override the auto-calculated rate for new products with no order history. Leave blank to use 30-day average.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={onClose} disabled={saving}
                style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d1d5db", background: "#fff", color: "#374151", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
                Cancel
              </button>
              <button type="submit" disabled={saving}
                style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: saving ? "#9ca3af" : "#111827", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 600 }}>
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </saveFetcher.Form>
        </div>
      </div>
    </div>
  );
}
