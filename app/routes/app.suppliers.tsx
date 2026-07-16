import { useState } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession, invalidateShopCache } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { SupplierList, type SupplierRow } from "../components/suppliers/SupplierList";
import { SupplierFormModal } from "../components/suppliers/SupplierFormModal";
import { SuppliersUpsellCard } from "../components/suppliers/SuppliersUpsellCard";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;

  const [suppliers, productCounts] = await Promise.all([
    prisma.supplier.findMany({ where: { shop }, orderBy: { name: "asc" } }),
    prisma.inventoryTracking.groupBy({
      by: ["supplierId"],
      where: { shop, supplierId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countBySupplier = new Map(productCounts.map((c) => [c.supplierId as string, c._count._all]));

  const rows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    leadTimeDays: s.leadTimeDays,
    notes: s.notes,
    productCount: countBySupplier.get(s.id) ?? 0,
  }));

  return { suppliers: rows, plan, canManage: canUseFeature(plan, "purchaseOrders") };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;

  if (!canUseFeature(plan, "purchaseOrders")) {
    return { success: false as const, error: "Suppliers are an Enterprise plan feature." };
  }

  const form = await request.formData();
  const intent = form.get("intent") as string;

  if (intent === "create_supplier" || intent === "update_supplier") {
    const id = (form.get("id") as string) ?? "";
    const name = ((form.get("name") as string) ?? "").trim();
    const email = ((form.get("email") as string) ?? "").trim();
    const phone = ((form.get("phone") as string) ?? "").trim();
    const notes = ((form.get("notes") as string) ?? "").trim();
    const rawLeadTime = (form.get("leadTimeDays") as string) ?? "";

    if (!name) {
      return { success: false as const, error: "Supplier name is required." };
    }
    if (email && !EMAIL_RE.test(email)) {
      return { success: false as const, error: `"${email}" is not a valid email address.` };
    }
    const leadTimeDays =
      rawLeadTime.trim() !== "" && !isNaN(parseInt(rawLeadTime)) && parseInt(rawLeadTime) > 0
        ? parseInt(rawLeadTime)
        : null;

    const data = { name, email: email || null, phone: phone || null, notes: notes || null, leadTimeDays };

    if (intent === "create_supplier") {
      await prisma.supplier.create({ data: { shop, ...data } });
    } else {
      if (!id) return { success: false as const, error: "Missing supplier id." };
      const result = await prisma.supplier.updateMany({ where: { id, shop }, data });
      if (result.count === 0) return { success: false as const, error: "Supplier not found." };
    }

    invalidateShopCache(shop);
    return { success: true as const, intent };
  }

  if (intent === "delete_supplier") {
    const id = (form.get("id") as string) ?? "";
    if (!id) return { success: false as const, error: "Missing supplier id." };

    const poCount = await prisma.purchaseOrder.count({ where: { shop, supplierId: id } });
    if (poCount > 0) {
      return { success: false as const, error: `Cannot delete — this supplier has ${poCount} purchase order(s). Cancel or reassign them first.` };
    }

    const result = await prisma.supplier.deleteMany({ where: { id, shop } });
    if (result.count === 0) return { success: false as const, error: "Supplier not found." };

    invalidateShopCache(shop);
    return { success: true as const, intent };
  }

  return { success: false as const, error: "Unknown action." };
};

export default function SuppliersPage() {
  const { suppliers, canManage } = useLoaderData<typeof loader>();
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  return (
    <s-page heading="Suppliers" sub-heading="Manage suppliers you reorder inventory from">
      {canManage && (
        // @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type
        <s-button slot="primary-action" variant="primary" onClick={() => setShowCreateModal(true)} suppressHydrationWarning>
          Add Supplier
        </s-button>
      )}

      {!canManage ? (
        <SuppliersUpsellCard />
      ) : (
        <s-section heading="All suppliers">
          <SupplierList suppliers={suppliers} onEdit={setEditingSupplier} />
        </s-section>
      )}

      {(showCreateModal || editingSupplier) && (
        <SupplierFormModal
          supplier={editingSupplier}
          onClose={() => { setShowCreateModal(false); setEditingSupplier(null); }}
        />
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
