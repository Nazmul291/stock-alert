import { SkeletonBlock } from "./Skeleton";

// Mirrors the real layout section-by-section so each piece of the page has its
// own loading shape instead of one generic spinner — and so there's minimal
// layout shift once the real content swaps in.
export function DashboardSkeleton() {
  return (
    <>
      {/* Reserve space for SetupChecklist — it appears above the stats for new
          merchants (progressPct < 100). Without this placeholder the stats block
          shifts down when data loads, contributing to CLS. */}
      <s-section>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 16px" }}>
              <SkeletonBlock width={20} height={20} borderRadius={10} />
              <SkeletonBlock width="60%" height={14} />
            </div>
          ))}
        </div>
      </s-section>

      <s-section heading="Inventory Overview">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, margin: "8px 0" }}>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <SkeletonBlock width={48} height={28} style={{ margin: "0 auto 8px" }} />
              <SkeletonBlock width={70} height={13} style={{ margin: "0 auto" }} />
            </div>
          ))}
        </div>
        <SkeletonBlock width="100%" height={60} style={{ marginTop: 16 }} />
        <SkeletonBlock width="100%" height={24} style={{ marginTop: 12, borderRadius: 20 }} />
      </s-section>

      <s-section heading="Recent Alerts">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonBlock key={i} width="100%" height={48} borderRadius={6} />
          ))}
        </div>
      </s-section>

      <s-section heading="Store Information" slot="aside">
        <SkeletonBlock width="80%" height={16} style={{ marginBottom: 8 }} />
        <SkeletonBlock width="60%" height={16} />
      </s-section>

      <s-section heading="Quick Actions" slot="aside">
        <SkeletonBlock width="100%" height={36} borderRadius={8} />
      </s-section>
    </>
  );
}
