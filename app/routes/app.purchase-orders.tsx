import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { createSupplier } from "../lib/supplier.server";
import {
  previewPurchaseOrders,
  searchTrackedProducts,
  createPurchaseOrder,
  type SupplierPreview,
  type ProductPickerRow,
} from "../lib/purchase-order.server";
import { PurchaseOrderList, type PurchaseOrderRow } from "../components/purchase-orders/PurchaseOrderList";
import { CreatePurchaseOrderModal } from "../components/purchase-orders/CreatePurchaseOrderModal";
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

  // Read-only lookups, loaded via fetcher.load — GET, not a mutation.
  if (intent === "suggested_lines") {
    if (!canManage) return { preview: [] as SupplierPreview[] };
    const supplierId = url.searchParams.get("supplierId");
    const preview = await previewPurchaseOrders(shop, supplierId ? [supplierId] : undefined);
    return { preview };
  }
  if (intent === "search_products") {
    if (!canManage) return { products: [] as ProductPickerRow[] };
    const search = url.searchParams.get("search") ?? "";
    const products = await searchTrackedProducts(shop, { search });
    return { products };
  }

  const statusParam = url.searchParams.get("status");
  const status = STATUS_FILTERS.includes(statusParam as (typeof STATUS_FILTERS)[number]) ? statusParam : "all";

  const [orders, suppliers] = canManage
    ? await Promise.all([
        prisma.purchaseOrder.findMany({
          where: { shop, ...(status && status !== "all" ? { status: status as PurchaseOrderRow["status"] } : {}) },
          include: { supplier: { select: { name: true } }, _count: { select: { lineItems: true } } },
          orderBy: { createdAt: "desc" },
        }),
        prisma.supplier.findMany({ where: { shop }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      ])
    : [[], []];

  const rows: PurchaseOrderRow[] = orders.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.name,
    status: po.status,
    lineItemCount: po._count.lineItems,
    totalCost: po.totalCost,
    createdAt: po.createdAt.toISOString(),
  }));

  return { orders: rows, status: status ?? "all", canManage, suppliers };
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

  if (intent === "create_supplier") {
    const result = await createSupplier(shop, {
      name: (form.get("name") as string) ?? "",
      email: (form.get("email") as string) ?? "",
      phone: (form.get("phone") as string) ?? "",
      leadTimeDays: (form.get("leadTimeDays") as string) ?? "",
    });
    return { ...result, intent };
  }

  if (intent === "create_po") {
    const supplierId = form.get("supplierId") as string;
    if (!supplierId) return { success: false as const, error: "Select a supplier first." };

    try {
      const lines = JSON.parse((form.get("lines") as string) ?? "[]") as { variantId: string; quantityOrdered: number; unitCost?: number | null }[];
      const { purchaseOrderId } = await createPurchaseOrder(shop, supplierId, lines);
      invalidateShopCache(shop);
      return { success: true as const, intent, purchaseOrderId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create purchase order.";
      return { success: false as const, error: message };
    }
  }

  if (intent === "cancel_po") {
    const id = form.get("id") as string;
    if (!id) return { success: false as const, error: "Missing purchase order id." };
    const po = await prisma.purchaseOrder.findFirst({ where: { id, shop } });
    if (!po) return { success: false as const, error: "Purchase order not found." };
    if (po.status === "received") return { success: false as const, error: "Cannot cancel a fully received purchase order." };
    await prisma.purchaseOrder.updateMany({ where: { id, shop }, data: { status: "cancelled" } });
    invalidateShopCache(shop);
    return { success: true as const, intent };
  }

  return { success: false as const, error: "Unknown action." };
};

export default function PurchaseOrdersPage() {
  const data = useLoaderData<typeof loader>();
  const [showCreateModal, setShowCreateModal] = useState(false);

  if (!("canManage" in data) || !data.canManage) {
    return (
      <s-page heading="Purchase Orders" sub-heading="Create and track purchase orders for your suppliers">
        <SuppliersUpsellCard />
      </s-page>
    );
  }

  return (
    <s-page heading="Purchase Orders" sub-heading="Create and track purchase orders for your suppliers">
      {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
      <s-button slot="primary-action" variant="primary" onClick={() => setShowCreateModal(true)} suppressHydrationWarning>
        Create Purchase Order
      </s-button>

      <s-section heading="All purchase orders">
        <PurchaseOrderList orders={data.orders} activeStatus={data.status} />
      </s-section>

      {showCreateModal && <CreatePurchaseOrderModal suppliers={data.suppliers} onClose={() => setShowCreateModal(false)} />}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
