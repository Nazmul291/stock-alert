import { useMemo, useState } from "react";
import { useLoaderData } from "react-router";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { useSSECacheStore } from "../hooks/use-sse-cache-store";
import { canUseFeature } from "../lib/plan-limits";
import { PRODUCT_INVENTORY_QUERY, INVENTORY_ITEM_UPDATE_MUTATION, METAFIELDS_SET_MUTATION, METAFIELDS_DELETE_MUTATION } from "../lib/graphql";
import { syncInventoryItemMap, deleteInventoryItemMapForProducts } from "../lib/inventory-item-map.server";
import type { ProductDetailData } from "../lib/product-detail.server";
import { useProductDetailStore, type ProductDetailStore } from "../stores/product-detail-store";
import { useLiveEventsStore } from "../stores/live-events-store";
import { SSEErrorRetry } from "../components/Skeleton";
import { ProductDetailHeader } from "../components/products/ProductDetailHeader";
import { ProductConfigureCard, ProductConfigureCardSkeleton } from "../components/products/ProductConfigureCard";
import { ProductPurchaseOrdersList } from "../components/products/ProductPurchaseOrdersList";
import { ProductHistoryTimeline } from "../components/products/ProductHistoryTimeline";
import { SuppliersUpsellCard } from "../components/suppliers/SuppliersUpsellCard";
import { CreatePurchaseOrderModal, type CandidateRow } from "../components/purchase-orders/CreatePurchaseOrderModal";
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
          const label = v.variantTitle && v.variantTitle !== "Default Title" ? v.variantTitle : productTitle || v.variantId;
          errors.push(`Inventory tracking enable failed for ${label}: ${err instanceof Error ? err.message : "Unknown"}`);
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

      // Mirror into inventory_item_map so the inventory webhook's guard reads
      // the same monitoringEnabled the merchant just saved, and can resolve
      // these variants without an Admin call.
      await syncInventoryItemMap(
        shop,
        plan,
        variantsFresh
          .filter((v) => v.inventoryItemId)
          .map((v) => ({
            inventoryItemId: (v.inventoryItemId as string).split("/").pop() as string,
            productId,
            variantId: v.variantId,
            monitoringEnabled,
          })),
      ).catch((err) => console.error("[ProductDetail] inventory_item_map sync failed:", err));
    } else if (existingRows.length > 0) {
      await prisma.inventoryTracking.deleteMany({ where: { shop, productId: BigInt(productId) } });
      await deleteInventoryItemMapForProducts(shop, [productId]).catch(() => {});
    }

    // A plain product metafield with no dependency on InventoryTracking rows
    // (unlike auto_hide/auto_republish/custom_threshold below, which only
    // mean anything alongside a tracked product) — saved unconditionally so
    // it doesn't silently no-op if the product isn't tracked yet.
    const pricingRuleEnabled = form.get("pricingRuleEnabled") === "true";
    const rawPricingRuleType = form.get("pricingRuleType") as string;
    const pricingRuleType = rawPricingRuleType === "percentage" || rawPricingRuleType === "add" ? rawPricingRuleType : "times";
    const rawPricingRuleValue = parseFloat((form.get("pricingRuleValue") as string) ?? "");
    const pricingRuleValue = !isNaN(rawPricingRuleValue) && rawPricingRuleValue >= 0 ? rawPricingRuleValue : 0;

    try {
      const res = await admin.graphql(METAFIELDS_SET_MUTATION, {
        variables: {
          metafields: [{
            ownerId: `gid://shopify/Product/${productId}`,
            namespace: "stock_alert",
            key: "pricing_rule",
            type: "json",
            value: JSON.stringify({ enabled: pricingRuleEnabled, type: pricingRuleType, value: pricingRuleValue }),
          }],
        },
      });
      const json: MetafieldsSetResponse = await res.json();
      const errs = json.data?.metafieldsSet?.userErrors ?? [];
      if (errs.length > 0) errors.push(errs.map((e) => e.message).join(", "));
    } catch (err) {
      errors.push(`Pricing rule update failed: ${err instanceof Error ? err.message : "Unknown"}`);
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

  // create_supplier / create_po now go through api.purchase-orders.create.ts
  // (see purchase-order-actions-store.ts) instead of this route's own
  // action — one canonical endpoint shared by the Purchase Orders page, the
  // Products list, and this page, instead of three copies of the same logic.
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
// ProductConfigureCard is the one exception — it seeds its form state from
// props only once, on mount (see its own Skeleton export for why), so it's
// swapped for a shape-only skeleton instead of being mounted early with
// placeholder data. The Create Purchase Order button doesn't have this
// problem — it opens CreatePurchaseOrderModal, which isn't mounted at all
// until `data` (and therefore its `preselect` rows) is actually ready.
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
  const history = data?.history ?? [];

  const [showCreatePoModal, setShowCreatePoModal] = useState(false);
  const addPurchaseOrder = useProductDetailStore((s) => s.addPurchaseOrder);
  const bumpLiveEvents = useLiveEventsStore((s) => s.bump);

  // Depends on `data` directly (a stable store reference), not the
  // `product` local above — that falls back to a fresh `PLACEHOLDER_PRODUCT`
  // on every render while `data` is null, which would otherwise recompute
  // these on every render too. Only ever read once `data` is truthy anyway
  // (see the modal's render guard below).
  //
  // Every variant of a product carries the same shop-location list (only
  // `available` differs) — see getVariantLocationsForPicker — so any
  // variant's is the canonical one for this PO-wide choice. Mapped into the
  // modal's own {id,name} shape here rather than teaching it a second one.
  const poLocations = useMemo(
    () => (data?.variantsForPo[0]?.locations ?? []).map((l) => ({ id: l.locationId, name: l.locationName })),
    [data],
  );
  const poRows: CandidateRow[] = useMemo(
    () => (data?.variantsForPo ?? []).map((v) => ({
      productId: data!.product.productId,
      variantId: v.variantId,
      productTitle: data!.product.productTitle,
      variantTitle: v.variantTitle,
      sku: v.sku,
      imageUrl: data!.product.imageUrl,
      imageAlt: data!.product.imageAlt,
      currentQuantity: v.currentQuantity,
      suggestedQuantity: v.suggestedQuantity,
      unitCost: v.unitCost,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
    })),
    [data],
  );

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
            <div>
              <button
                type="button"
                disabled={loading}
                onClick={() => setShowCreatePoModal(true)}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "none",
                  background: loading ? "#9ca3af" : "#111827", color: "#fff",
                  cursor: loading ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600,
                }}
              >
                Create Purchase Order
              </button>
            </div>
            {showCreatePoModal && data && (
              <CreatePurchaseOrderModal
                // This page's supplier list doesn't carry paymentTerms (see
                // ProductDetailData) — the modal's "auto-fill terms from the
                // supplier" feature just no-ops here, same as before this
                // page had it at all.
                suppliers={suppliers.map((s) => ({ ...s, paymentTerms: null }))}
                locations={poLocations}
                preselect={{ productId: product.productId, rows: poRows, defaultSupplierId: product.supplierId ?? null }}
                onCreated={({ purchaseOrder, supplierId }) => {
                  // Patches the new PO straight into this page's store so the
                  // pending list above shows it immediately, instead of
                  // waiting on the background SSE refetch the bump below
                  // triggers (that refetch still happens and reconciles
                  // this).
                  addPurchaseOrder({
                    id: purchaseOrder.purchaseOrderId,
                    poNumber: purchaseOrder.poNumber,
                    status: "draft",
                    supplierId,
                    supplierName: purchaseOrder.supplierName,
                    quantityOrdered: purchaseOrder.lineItems.reduce((sum, li) => sum + li.quantityOrdered, 0),
                    quantityReceived: 0,
                    createdAt: purchaseOrder.createdAt,
                    lineItems: purchaseOrder.lineItems.map((li) => ({ ...li, locations: [] })),
                  });
                  bumpLiveEvents(["product-detail"]);
                }}
                onClose={() => setShowCreatePoModal(false)}
              />
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
