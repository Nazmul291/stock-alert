import { SkeletonBlock } from "./Skeleton";

export function IntegrationsSkeleton() {
  return (
    <>
      <s-section heading="Notifications">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, marginBottom: 12, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <SkeletonBlock width={120} height={16} />
              <SkeletonBlock width={44} height={24} borderRadius={12} />
            </div>
          </div>
        ))}
      </s-section>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Marketing Automation">
          <SkeletonBlock width="100%" height={56} borderRadius={10} />
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Shopify Flow">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: 3 }, (_, i) => <SkeletonBlock key={i} width="100%" height={48} borderRadius={8} />)}
          </div>
        </s-section>
      </div>

      <div style={{ marginTop: 24 }}>
        <s-section heading="Outbound Webhook">
          <SkeletonBlock width="100%" height={36} borderRadius={8} />
        </s-section>
      </div>
    </>
  );
}
