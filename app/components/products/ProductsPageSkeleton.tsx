import { SkeletonBlock } from "../Skeleton";

export function ProductsPageSkeleton() {
  return (
    <>
      <s-button slot="primary-action" disabled>Sync Products</s-button>
      <s-section heading="">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <SkeletonBlock width="100%" height={32} borderRadius={6} />
        </div>
        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
          {Array.from({ length: 5 }, (_, i) => <SkeletonBlock key={i} width={90} height={20} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 8 }, (_, i) => (
            <SkeletonBlock key={i} width="100%" height={56} borderRadius={6} />
          ))}
        </div>
      </s-section>
    </>
  );
}
