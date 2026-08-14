const DEFAULT_VARIANT_TITLE = "Default Title";

// Shopify names the sole variant of any product with no real options
// "Default Title" — merchants never chose that name and it's meaningless to
// them, so every variant-title display in this app (UI, emails, Slack,
// WhatsApp, Asana, purchase orders, the admin extension) treats it as
// equivalent to no variant title at all, falling back to the product title.
// Multi-variant products never actually have this value on any of their
// variants (Shopify only assigns it when a product has no options), so this
// is safe to apply unconditionally wherever a variant title is shown.
export function realVariantTitle(variantTitle: string | null | undefined): string | null {
  return variantTitle && variantTitle !== DEFAULT_VARIANT_TITLE ? variantTitle : null;
}

// "{productTitle} — {variantTitle}" when there's a real variant title,
// otherwise just the product title alone.
export function productVariantLabel(productTitle: string | null, variantTitle: string | null | undefined): string {
  const product = productTitle ?? "—";
  const variant = realVariantTitle(variantTitle);
  return variant ? `${product} — ${variant}` : product;
}
