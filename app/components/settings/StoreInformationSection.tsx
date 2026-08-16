import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useSettingsStore } from "../../stores/settings-store";
import { useLiveEventsStore } from "../../stores/live-events-store";

type SyncResult = { intent: "sync_store_details"; success: true; storeName: string | null; storeEmail: string | null };

// Store name/owner email are cached from the Admin API for 24h (see
// shop-cache.server.ts) — this section shows the cached values and lets a
// merchant force an immediate refresh after renaming their store or
// changing the owner email in Shopify admin, rather than waiting out the
// cache. Read-only: unlike the rest of this page, there's nothing here to
// edit — these values come from Shopify, not from StoreSettings.
export function StoreInformationSection() {
  const loading = useSettingsStore((s) => s.data === null);
  const storeName = useSettingsStore((s) => s.data?.storeName) ?? null;
  const storeEmail = useSettingsStore((s) => s.data?.storeEmail) ?? null;
  const syncFetcher = useFetcher<SyncResult>();
  const syncing = syncFetcher.state !== "idle";
  const bumpLiveEvents = useLiveEventsStore((s) => s.bump);
  const [justSynced, setJustSynced] = useState(false);

  // refreshShopIdentity never throws — a Shopify fetch failure degrades to
  // null (same honest-null convention as everywhere else this app reads the
  // Admin API), not an error response, so this always treats a completed
  // request as "synced" and just displays whatever came back.
  useEffect(() => {
    if (syncFetcher.state !== "idle" || syncFetcher.data?.intent !== "sync_store_details") return;
    // Same pattern as the main Save action — re-pulls /api/settings-stream
    // so the values above reflect what refreshShopIdentity just fetched,
    // without a full page reload.
    bumpLiveEvents(["settings"]);
    setJustSynced(true);
    const t = setTimeout(() => setJustSynced(false), 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.state, syncFetcher.data]);

  return (
    // marginBottom, not marginTop like every other section on this page —
    // this one sits between PlanCard (which already supplies its own
    // marginBottom:24 to space itself from what follows) and
    // InventorySettingsSection (the first <s-section> in the <Form>, which
    // has no top margin of its own since it's normally first on the page).
    // A marginTop here would double up with PlanCard's spacing above, while
    // leaving a zero-gap collision with InventorySettingsSection below —
    // marginBottom fixes both at once by taking over PlanCard's usual role.
    <div style={{ marginBottom: 24 }}>
      <s-section heading="Store Information">
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 0, marginBottom: 16 }}>
          Pulled from Shopify and cached for up to 24 hours. If you&apos;ve just renamed your store or changed the
          owner email, sync now instead of waiting.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Store name</div>
            <div className={loading ? "skeleton-text" : undefined} style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>
              {storeName ?? "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: "#6b7280", marginBottom: 4 }}>Owner email</div>
            <div className={loading ? "skeleton-text" : undefined} style={{ fontSize: 14, color: "#111827", fontWeight: 500 }}>
              {storeEmail ?? "—"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            disabled={syncing}
            onClick={() => syncFetcher.submit({ intent: "sync_store_details" }, { method: "post" })}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1.5px solid #d1d5db",
              background: "#fff", color: "#374151", fontSize: 13, fontWeight: 600,
              cursor: syncing ? "not-allowed" : "pointer",
            }}
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          {justSynced && <span style={{ fontSize: 13, color: "#059669", fontWeight: 600 }}>✓ Synced</span>}
        </div>
      </s-section>
    </div>
  );
}
