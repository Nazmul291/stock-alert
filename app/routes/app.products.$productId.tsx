import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { useSSECacheStore } from "../hooks/use-sse-cache-store";
import { canUseFeature } from "../lib/plan-limits";
import { createSupplier } from "../lib/supplier.server";
import { createPurchaseOrder } from "../lib/purchase-order.server";
import { PRODUCT_INVENTORY_QUERY, INVENTORY_ITEM_UPDATE_MUTATION, METAFIELDS_SET_MUTATION, METAFIELDS_DELETE_MUTATION } from "../lib/graphql";
import type { ProductDetailData } from "../lib/product-detail.server";
import { useProductDetailStore, type ProductDetailStore } from "../stores/product-detail-store";
import { SSEErrorRetry } from "../components/Skeleton";
import { ProductDetailHeader } from "../components/products/ProductDetailHeader";
import { ProductConfigureCard, ProductConfigureCardSkeleton } from "../components/products/ProductConfigureCard";
import { ProductCreatePoCard, ProductCreatePoCardSkeleton } from "../components/products/ProductCreatePoCard";
import { ProductPurchaseOrdersList } from "../components/products/ProductPurchaseOrdersList";
import { ProductHistoryTimeline } from "../components/products/ProductHistoryTimeline";
import { SuppliersUpsellCard } from "../components/suppliers/SuppliersUpsellCard";
import type { ProductRow } from "../components/products/ProductEditModal";

// Only the auth check + plan lookup block the response — hands off to
// api.product-detail-stream.ts (authenticated the same way as this loader,
// via App Bridge's automatic session-token fetch header) for the actual
// DB/Shopify-API work, matching every other page in this app (Products list,
// Dashboard, Settings, etc.) instead of blocking the document response on
// getProductDetail directly. See product-detail-store.ts.
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const storeSession = await getCachedSession(session.shop);
  const plan = storeSession?.plan ?? "basic";
  const productId = params.productId as string;

  return { productId, plan };
};

type InventoryItemUpdateResponse = {
  data?: { inventoryItemUpdate?: { userErrors: { field: string[] | null; message: string }[] } };
  errors?: { message: string }[];
};
type ProductInventoryVariantEdge = {
  node: {
    id: string; title: string; sku: string | null;
    inventoryItem: {
      id: string; tracked: boolean;
      inventoryLevels?: { edges: { node: { quantities: { name: string; quantity: number }[] } }[] };
    } | null;
  };
};
type ProductInventoryResponse = {
  data?: { product?: { variants: { edges: ProductInventoryVariantEdge[] } } | null };
  errors?: { message: string }[];
};
type MetafieldsSetResponse = { data?: { metafieldsSet?: { userErrors: { field: string[] | null; message: string }[] } } };
type MetafieldInput = { ownerId: string; namespace: string; key: string; value: string; type: string };

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? "basic";
  const productId = params.productId as string;

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "configure_product") {
    const tracked = form.get("tracked") === "true";
    const monitoringEnabled = form.get("monitoringEnabled") === "true";
    const errors: string[] = [];

    const settings = await prisma.storeSettings.findUnique({ where: { shop } });
    const threshold = settings?.lowStockThreshold ?? 5;
    const existingRows = await prisma.inventoryTracking.findMany({ where: { shop, productId: BigInt(productId) } });
    const productTitle = existingRows[0]?.productTitle ?? "";

    const rawManualSales = ((form.get("manualDailySales") as string) ?? "").trim();
    const manualDailySales = rawManualSales !== "" && !isNaN(parseFloat(rawManualSales)) ? parseFloat(rawManualSales) : null;
    const rawRestockDate = ((form.get("expectedRestockDate") as string) ?? "").trim();
    const expectedRestockDate = rawRestockDate ? new Date(rawRestockDate) : null;

    const customThresholdRaw = ((form.get("customThreshold") as string) ?? "").trim();
    const parsedCustomThreshold = customThresholdRaw !== "" ? parseInt(customThresholdRaw) : NaN;
    const effectiveThreshold =
      canUseFeature(plan, "perProductThresholds") && !isNaN(parsedCustomThreshold) && parsedCustomThreshold >= 0
        ? parsedCustomThreshold
        : threshold;

    if (tracked) {
      // Re-derive the authoritative variant list straight from Shopify
      // (rather than trusting anything client-submitted) — same reasoning
      // the old products-list modal action documented: a stale/incomplete
      // client snapshot must never silently drop a DB write.
      let variantsFresh: Array<{ variantId: string; variantTitle: string | null; sku: string | null; qty: number; inventoryItemId: string | null; alreadyTracked: boolean }> = [];
      try {
        const res = await admin.graphql(PRODUCT_INVENTORY_QUERY, { variables: { id: `gid://shopify/Product/${productId}` } });
        const json: ProductInventoryResponse = await res.json();
        if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
        const edges = json.data?.product?.variants?.edges ?? [];
        variantsFresh = edges.map((e) => {
          const v = e.node;
          const qty = (v.inventoryItem?.inventoryLevels?.edges ?? []).reduce((sum: number, le) => {
            const avail = (le.node.quantities ?? []).find((q) => q.name === "available");
            return sum + (avail?.quantity ?? 0);
          }, 0);
          return {
            variantId: v.id.split("/").pop() as string,
            variantTitle: v.title ?? null,
            sku: v.sku || null,
            qty,
            inventoryItemId: v.inventoryItem?.id ?? null,
            alreadyTracked: v.inventoryItem?.tracked === true,
          };
        });
      } catch (err) {
        errors.push(`Failed to refresh inventory: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      // Mark every not-yet-tracked variant as tracked in Shopify — every
      // variant, not just one (the old single-item mutation only ever
      // touched the first variant of a multi-variant product).
      for (const v of variantsFresh) {
        if (!v.inventoryItemId || v.alreadyTracked) continue;
        try {
          const res = await admin.graphql(INVENTORY_ITEM_UPDATE_MUTATION, { variables: { id: v.inventoryItemId, input: { tracked: true } } });
          const json: InventoryItemUpdateResponse = await res.json();
          const errs = json.data?.inventoryItemUpdate?.userErrors ?? [];
          if (errs.length > 0) errors.push(errs.map((e) => e.message).join(", "));
        } catch (err) {
          errors.push(`Inventory tracking enable failed for ${v.variantTitle ?? v.variantId}: ${err instanceof Error ? err.message : "Unknown"}`);
        }
      }

      const existingByVariantId = new Map(existingRows.map((r) => [r.variantId.toString(), r]));

      for (const v of variantsFresh) {
        const existingRow = existingByVariantId.get(v.variantId);

        if (existingRow) {
          // currentQuantity/inventoryStatus are deliberately left untouched —
          // the inventory webhook is the sole source of truth for those;
          // this save only touches fields it doesn't own. stockOutDays is
          // recomputed off the currently-stored quantity so it still updates
          // immediately when just the sales estimate changes.
          const effectiveSales = manualDailySales ?? existingRow.avgDailySales ?? null;
          const stockOutDays = effectiveSales
            ? Math.min(999, Math.ceil(existingRow.currentQuantity / effectiveSales))
            : undefined;

          // A product benched by plan-limit enforcement can't be re-enabled
          // from here — that would let a merchant self-service past their
          // plan's product cap without upgrading.
          const isPlanBenched = existingRow.inventoryStatus === "requires_upgrade";
          const effectiveMonitoringEnabled = isPlanBenched ? false : monitoringEnabled;

          const monitoringChanged = !isPlanBenched && effectiveMonitoringEnabled !== existingRow.monitoringEnabled;
          const recomputedStatus: "in_stock" | "low_stock" | "out_of_stock" =
            existingRow.currentQuantity <= 0
              ? "out_of_stock"
              : existingRow.currentQuantity <= effectiveThreshold
              ? "low_stock"
              : "in_stock";
          const statusPatch = !monitoringChanged
            ? {}
            : effectiveMonitoringEnabled
            ? { inventoryStatus: recomputedStatus }
            : { inventoryStatus: "deactivated" as const };

          await prisma.inventoryTracking.update({
            where: { id: existingRow.id },
            data: {
              variantTitle: v.variantTitle,
              sku: v.sku,
              monitoringEnabled: effectiveMonitoringEnabled,
              manualDailySales,
              expectedRestockDate,
              ...statusPatch,
              ...(stockOutDays !== undefined ? { stockOutDays } : {}),
            },
          });
        } else {
          // First time this variant is tracked — no webhook history exists
          // yet, so seed its baseline quantity/status now.
          const invStatus: "in_stock" | "low_stock" | "out_of_stock" =
            v.qty <= 0 ? "out_of_stock" : v.qty <= effectiveThreshold ? "low_stock" : "in_stock";
          await prisma.inventoryTracking.create({
            data: {
              shop,
              productId: BigInt(productId),
              variantId: BigInt(v.variantId),
              productTitle,
              variantTitle: v.variantTitle,
              sku: v.sku,
              currentQuantity: v.qty,
              previousQuantity: v.qty,
              inventoryStatus: invStatus,
              monitoringEnabled,
              manualDailySales,
              expectedRestockDate,
            },
          });
        }
      }
    } else if (existingRows.length > 0) {
      await prisma.inventoryTracking.deleteMany({ where: { shop, productId: BigInt(productId) } });
    }

    if (tracked) {
      const autoHide = form.get("autoHide") === "true";
      const autoRepublish = form.get("autoRepublish") === "true";
      const customThresholdMetafieldId = ((form.get("customThresholdMetafieldId") as string) ?? "").trim() || null;
      const ownerId = `gid://shopify/Product/${productId}`;

      const metafieldsToSet: MetafieldInput[] = [
        { ownerId, namespace: "stock_alert", key: "auto_hide", value: String(autoHide), type: "boolean" },
        { ownerId, namespace: "stock_alert", key: "auto_republish", value: String(autoRepublish), type: "boolean" },
      ];

      if (!isNaN(parsedCustomThreshold) && parsedCustomThreshold >= 0) {
        metafieldsToSet.push({ ownerId, namespace: "stock_alert", key: "custom_threshold", value: String(parsedCustomThreshold), type: "number_integer" });
      }

      try {
        const mfRes = await admin.graphql(METAFIELDS_SET_MUTATION, { variables: { metafields: metafieldsToSet } });
        const mfJson: MetafieldsSetResponse = await mfRes.json();
        const mfErrs = mfJson.data?.metafieldsSet?.userErrors ?? [];
        if (mfErrs.length > 0) errors.push(mfErrs.map((e) => e.message).join(", "));
      } catch (err) {
        errors.push(`Metafield update failed: ${err instanceof Error ? err.message : "Unknown"}`);
      }

      if (customThresholdRaw === "" && customThresholdMetafieldId) {
        try {
          await admin.graphql(METAFIELDS_DELETE_MUTATION, {
            variables: { metafields: [{ ownerId, namespace: "stock_alert", key: "custom_threshold" }] },
          });
        } catch {
          // Non-critical
        }
      }
    }

    invalidateShopCache(shop);

    if (errors.length > 0) return { error: errors.join(" | ") };
    return { success: true as const, message: "Product settings saved." };
  }

  if (!canUseFeature(plan, "purchaseOrders")) {
    return { success: false as const, error: "Suppliers and purchase orders are an Enterprise plan feature." };
  }

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
      const po = await createPurchaseOrder(shop, supplierId, lines, admin);
      // Ordering from a supplier for this product makes them the product's
      // supplier of record going forward — assigns/updates every variant of
      // this product, not just the ones on this PO's lines, so the product
      // stays consistently tied to one supplier (mirrors how ProductRow's
      // supplierId is read from a single representative variant).
      await prisma.inventoryTracking.updateMany({
        where: { shop, productId: BigInt(productId) },
        data: { supplierId },
      });
      invalidateShopCache(shop);
      // Returns the full created PO (not just its id) so the client can patch
      // it straight into the page's store instead of waiting on a background
      // SSE refetch to see the new pending PO show up — see ProductCreatePoCard.
      return { success: true as const, intent, ...po };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create purchase order.";
      return { success: false as const, error: message };
    }
  }

  return { success: false as const, error: "Unknown action." };
};

export default function ProductDetailPage() {
  const { productId, plan } = useLoaderData<typeof loader>();

  useSSECacheStore<ProductDetailData, ProductDetailStore>(
    useProductDetailStore,
    productId,
    () => `/api/product-detail-stream?productId=${encodeURIComponent(productId)}`,
    "product-detail",
  );

  const storeError = useProductDetailStore((s) => s.error);
  const retry = useProductDetailStore((s) => s.retry);
  // Read directly (not just via ProductDetailContent) so the page heading
  // itself shows the real product title/SKU as soon as data lands, instead
  // of a static "Product" for the whole page lifetime.
  const product = useProductDetailStore((s) => s.data?.product);

  return (
    <s-page heading={product?.productTitle ?? "Product"} sub-heading={product?.sku ? `SKU: ${product.sku}` : undefined}>
      {storeError ? (
        <SSEErrorRetry message={storeError} onRetry={retry ?? (() => {})} />
      ) : (
        <ProductDetailContent plan={plan} />
      )}
    </s-page>
  );
}

// Reserves the same header shape as a real product (single-variant summary
// block, not the multi-variant table) while data is still loading — see
// ProductsTable.tsx's PLACEHOLDER_ROWS for the equivalent on the list page.
const PLACEHOLDER_PRODUCT: ProductRow = {
  id: "skeleton",
  productId: "skeleton",
  productTitle: "Product name",
  sku: "SKU-0000",
  currentQuantity: 0,
  inventoryStatus: "in_stock",
  isHidden: false,
  isTracked: false,
  monitoringEnabled: false,
  imageUrl: null,
  imageAlt: "",
  shopifyStatus: "ACTIVE",
  inventoryItemId: null,
  stockOutDays: null,
  avgDailySales: null,
  manualDailySales: null,
  expectedRestockDate: null,
  variants: [],
};

// Always renders inside the same <s-page>, with the exact same section
// layout whether loading or loaded — matching the rest of the app's
// skeleton architecture (Products list, Dashboard, etc.): mask individual
// dynamic values with `.skeleton-text` instead of swapping in a different
// placeholder layout, so there's no layout shift once real data lands.
// ProductConfigureCard/ProductCreatePoCard are the one exception — both
// seed their form state from props only once, on mount (see each one's own
// Skeleton export for why), so they're swapped for a shape-only skeleton
// instead of being mounted early with placeholder data.
function ProductDetailContent({ plan }: { plan: string }) {
  const data = useProductDetailStore((s) => s.data);
  const loading = data === null;
  const canPerProductThreshold = canUseFeature(plan, "perProductThresholds");
  // Derived from `plan` (already known from the loader), not `data` — so
  // this branch is decided correctly from the very first render instead of
  // flipping between SuppliersUpsellCard and the real section once data
  // arrives.
  const canManageSupplier = canUseFeature(plan, "purchaseOrders");

  const product = data?.product ?? PLACEHOLDER_PRODUCT;
  const purchaseOrders = data?.purchaseOrders ?? [];
  const suppliers = data?.suppliers ?? [];
  const variantsForPo = data?.variantsForPo ?? [];
  const history = data?.history ?? [];

  return (
    <>
      {/* Main (left) column — overview, purchase orders, and activity history. */}
      <s-section heading="Overview">
        <ProductDetailHeader product={product} loading={loading} />
      </s-section>

      {canManageSupplier ? (
        <s-section heading="Purchase Orders">
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <ProductPurchaseOrdersList purchaseOrders={purchaseOrders} suppliers={suppliers} productTitle={product.productTitle} loading={loading} />
            {data ? (
              <ProductCreatePoCard
                variants={variantsForPo}
                suppliers={suppliers}
                defaultSupplierId={product.supplierId ?? null}
                productTitle={product.productTitle}
              />
            ) : (
              <ProductCreatePoCardSkeleton />
            )}
          </div>
        </s-section>
      ) : (
        <SuppliersUpsellCard />
      )}

      <s-section heading="History">
        <ProductHistoryTimeline history={history} loading={loading} />
      </s-section>

      {/* Aside (right) column — same two-column layout the dashboard uses
          (plain <s-section>s vs slot="aside"). A plain div (not <s-section>)
          so ProductConfigureCard's own card border is the only container —
          no extra heading/box wrapping it. */}
      <div slot="aside">
        {data ? (
          <ProductConfigureCard
            product={data.product}
            configure={data.configure}
            storeDefaults={data.storeDefaults}
            canPerProductThreshold={canPerProductThreshold}
          />
        ) : (
          <ProductConfigureCardSkeleton />
        )}
      </div>
    </>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
