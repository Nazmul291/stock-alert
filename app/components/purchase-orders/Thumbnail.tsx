export function Thumbnail({ imageUrl, imageAlt, size = 36 }: { imageUrl: string | null; imageAlt: string | null; size?: number }) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl} alt={imageAlt ?? ""} width={size} height={size}
        style={{ width: size, height: size, borderRadius: 6, objectFit: "cover", flexShrink: 0, border: "1px solid #f3f4f6" }}
      />
    );
  }
  return <div style={{ width: size, height: size, borderRadius: 6, background: "#f3f4f6", flexShrink: 0 }} />;
}
