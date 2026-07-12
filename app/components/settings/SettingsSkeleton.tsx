import { SkeletonBlock } from "../Skeleton";

export function SettingsSkeleton() {
  return (
    <>
      <div style={{ marginBottom: 24, padding: "16px 20px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <SkeletonBlock width={90} height={16} />
          <SkeletonBlock width={80} height={20} borderRadius={20} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "8px 12px" }}>
          {Array.from({ length: 8 }, (_, i) => <SkeletonBlock key={i} width="80%" height={13} />)}
        </div>
      </div>

      <s-section heading="Inventory Settings">
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f3f4f6" }}>
              <SkeletonBlock width={220} height={14} />
              <SkeletonBlock width={44} height={24} borderRadius={12} />
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
          <SkeletonBlock width={120} height={36} borderRadius={8} />
          <SkeletonBlock width={120} height={36} borderRadius={8} />
        </div>
      </s-section>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Digest Emails">
          <SkeletonBlock width="100%" height={40} borderRadius={8} />
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Email Branding">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <SkeletonBlock width="100%" height={36} borderRadius={8} />
            <SkeletonBlock width="100%" height={36} borderRadius={8} />
          </div>
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Monitoring Scope">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} width="100%" height={56} borderRadius={8} />)}
          </div>
        </s-section>
      </div>
    </>
  );
}
