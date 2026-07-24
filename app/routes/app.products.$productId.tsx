import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { createSupplier } from "../lib/supplier.server";
import { createPurchaseOrder } from "../lib/purchase-order.server";
import { getProductDetail } from "../lib/product-detail.server";
import { ProductDetailHeader } from "../components/products/ProductDetailHeader";
import { ProductCreatePoCard } from "../components/products/ProductCreatePoCard";
import { ProductHistoryTimeline } from "../components/products/ProductHistoryTimeline";
import { SuppliersUpsellCard } from "../components/suppliers/SuppliersUpsellCard";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";

  const productId = params.productId as string;
  const detail = await getProductDetail(shop, productId, plan, admin);
  if (!detail) throw new Response("Not Found", { status: 404 });

  return { productId, ...detail };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";

  if (!canUseFeature(plan, "purchaseOrders")) {
    return { success: false as const, error: "Suppliers and purchase orders are an Enterprise plan feature." };
  }

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create_supplier") {
    const result = await createSupplier(shop, {
      name: (form.get("name") as string) ?? "",
      email: (form.get("email") as string) ?? "",
      leadTimeDays: (form.get("leadTimeDays") as string) ?? "",
    });
    return { ...result, intent };
  }

  if (intent === "create_po") {
    const supplierId = form.get("supplierId") as string;
    if (!supplierId) return { success: false as const, error: "Select a supplier first." };

    try {
      const lines = JSON.parse((form.get("lines") as string) ?? "[]") as {
        variantId: string;
        quantityOrdered: number;
        unitCost?: number | null;
        locationId?: string | null;
        locationName?: string | null;
      }[];
      const { purchaseOrderId } = await createPurchaseOrder(shop, supplierId, lines, admin);
      invalidateShopCache(shop);
      return { success: true as const, intent, purchaseOrderId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create purchase order.";
      return { success: false as const, error: message };
    }
  }

  return { success: false as const, error: "Unknown action." };
};

export default function ProductDetailPage() {
  const { product, canManageSupplier, suppliers, variantsForPo, history } = useLoaderData<typeof loader>();

  return (
    <s-page heading={product.productTitle} sub-heading={product.sku ? `SKU: ${product.sku}` : undefined}>
      <s-section heading="Overview">
        <ProductDetailHeader product={product} />
      </s-section>

      {canManageSupplier ? (
        <s-section heading="Purchase Orders">
          <ProductCreatePoCard
            variants={variantsForPo}
            suppliers={suppliers}
            defaultSupplierId={product.supplierId ?? null}
          />
        </s-section>
      ) : (
        <SuppliersUpsellCard />
      )}

      <s-section heading="History">
        <ProductHistoryTimeline history={history} />
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
