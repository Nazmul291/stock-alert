import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { previewPurchaseOrders, generatePurchaseOrder, type SupplierPreview } from "../lib/purchase-order.server";
import { PurchaseOrderList, type PurchaseOrderRow } from "../components/purchase-orders/PurchaseOrderList";
import { GeneratePOModal } from "../components/purchase-orders/GeneratePOModal";
import { SuppliersUpsellCard } from "../components/suppliers/SuppliersUpsellCard";

const STATUS_FILTERS = ["all", "draft", "ordered", "partially_received", "received", "cancelled"] as const;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;
  const canManage = canUseFeature(plan, "purchaseOrders");

  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");

  // Read-only preview, loaded via fetcher.load — GET, not a mutation.
  if (intent === "preview_generate") {
    if (!canManage) return { preview: [] as SupplierPreview[] };
    const preview = await previewPurchaseOrders(shop);
    return { preview };
  }

  const statusParam = url.searchParams.get("status");
  const status = STATUS_FILTERS.includes(statusParam as (typeof STATUS_FILTERS)[number]) ? statusParam : "all";

  const orders = canManage
    ? await prisma.purchaseOrder.findMany({
        where: { shop, ...(status && status !== "all" ? { status: status as PurchaseOrderRow["status"] } : {}) },
        include: { supplier: { select: { name: true } }, _count: { select: { lineItems: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const rows: PurchaseOrderRow[] = orders.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.name,
    status: po.status,
    lineItemCount: po._count.lineItems,
    totalCost: po.totalCost,
    createdAt: po.createdAt.toISOString(),
  }));

  return { orders: rows, status: status ?? "all", canManage };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;

  if (!canUseFeature(plan, "purchaseOrders")) {
    return { success: false as const, error: "Purchase orders are an Enterprise plan feature." };
  }

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "confirm_generate_po") {
    const supplierId = form.get("supplierId") as string;
    const quantityOverrides = JSON.parse((form.get("quantityOverrides") as string) ?? "{}") as Record<string, number>;
    if (!supplierId) return { success: false as const, error: "Missing supplier." };

    try {
      const { purchaseOrderId } = await generatePurchaseOrder(shop, supplierId, { quantityOverrides });
      invalidateShopCache(shop);
      return { success: true as const, intent, purchaseOrderId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate purchase order.";
      return { success: false as const, error: message };
    }
  }

  if (intent === "cancel_po") {
    const id = form.get("id") as string;
    if (!id) return { success: false as const, error: "Missing purchase order id." };
    const po = await prisma.purchaseOrder.findFirst({ where: { id, shop } });
    if (!po) return { success: false as const, error: "Purchase order not found." };
    if (po.status === "received") return { success: false as const, error: "Cannot cancel a fully received purchase order." };
    await prisma.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
    invalidateShopCache(shop);
    return { success: true as const, intent };
  }

  return { success: false as const, error: "Unknown action." };
};

export default function PurchaseOrdersPage() {
  const data = useLoaderData<typeof loader>();
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  if (!("canManage" in data) || !data.canManage) {
    return (
      <s-page heading="Purchase Orders" sub-heading="Generate and track purchase orders from your stockout forecast">
        <SuppliersUpsellCard />
      </s-page>
    );
  }

  return (
    <s-page heading="Purchase Orders" sub-heading="Generate and track purchase orders from your stockout forecast">
      {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
      <s-button slot="primary-action" variant="primary" onClick={() => setShowGenerateModal(true)} suppressHydrationWarning>
        Generate Purchase Orders
      </s-button>

      <s-section heading="All purchase orders">
        <PurchaseOrderList orders={data.orders} activeStatus={data.status} />
      </s-section>

      {showGenerateModal && <GeneratePOModal onClose={() => setShowGenerateModal(false)} />}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
