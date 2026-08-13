import type { LoaderFunctionArgs } from "react-router";
import { extensionCorsPreflight, extensionJSON } from "../lib/extension-cors.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { getProductDetail } from "../lib/product-detail.server";

// Backs the Admin UI extension on the product details page (see
// extensions/product-supplier-po) — tells it whether this shop can create
// suppliers/POs at all, and if so, what to show: the shop's existing
// suppliers and this product's tracked variants (with a suggested reorder
// quantity each), same as ProductCreatePoCard on the full product-detail
// page. Reuses getProductDetail wholesale rather than a bespoke query —
// it's a little more work than strictly needed (also computes purchase
// order history, metafields, etc. that this trims away below), but this is
// an occasional action-modal open, not a hot path, and staying on one
// source of truth for "what can this product be ordered as" is worth it.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return extensionCorsPreflight();

  return extensionJSON(request, async ({ admin, shop }) => {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");
    if (!productId) throw new Error("Missing product id.");

    const storeSession = await getCachedSession(shop);
    const plan = storeSession?.plan ?? "basic";

    const detail = await getProductDetail(shop, productId, plan, admin);
    if (!detail) throw new Error("Product not found.");

    return {
      entitled: detail.canManageSupplier,
      productTitle: detail.product.productTitle,
      suppliers: detail.suppliers,
      variants: detail.variantsForPo.map((v) => ({
        variantId: v.variantId,
        variantTitle: v.variantTitle,
        sku: v.sku,
        currentQuantity: v.currentQuantity,
        suggestedQuantity: v.suggestedQuantity,
      })),
    };
  });
};
