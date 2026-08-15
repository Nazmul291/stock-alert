import { useState } from "react";
import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getCachedSession } from "../lib/shop-cache.server";
import { canUseFeature } from "../lib/plan-limits";
import { previewPurchaseOrders, getShopLocations, type SupplierPreview } from "../lib/purchase-order.server";
import { SuppliersUpsellCard } from "../components/suppliers/SuppliersUpsellCard";
import { ReorderPlannerStatCards } from "../components/reorder-planner/ReorderPlannerStatCards";
import { ReorderPlannerSupplierGroup } from "../components/reorder-planner/ReorderPlannerSupplierGroup";

// Both branches return the same shape (empty/zeroed when the plan can't
// manage purchase orders) so the component never has to narrow a union
// before its hooks run — see the component below.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const storeSession = await getCachedSession(shop);
  const plan = storeSession?.plan ?? null;
  const canManage = canUseFeature(plan, "purchaseOrders");

  if (!canManage) {
    return {
      canManage: false as const,
      preview: [] as SupplierPreview[],
      suppliers: [] as { id: string; name: string; paymentTerms: string | null }[],
      locations: [] as { id: string; name: string }[],
      productsNeedingReorder: 0,
      avgLeadTimeDays: 0,
      suppliersActive: 0,
    };
  }

  const [preview, suppliers, locations] = await Promise.all([
    previewPurchaseOrders(shop),
    prisma.supplier.findMany({ where: { shop }, select: { id: true, name: true, paymentTerms: true }, orderBy: { name: "asc" } }),
    getShopLocations(admin).catch(() => []),
  ]);

  // Distinct products, not lines — a product with two at-risk variants
  // should read as 1 product needing reorder, matching the plain-English
  // meaning of the stat card.
  const productsNeedingReorder = new Set(preview.flatMap((g) => g.lines.map((l) => l.productId))).size;
  const avgLeadTimeDays = preview.length
    ? Math.round(preview.reduce((sum, g) => sum + g.leadTimeDays, 0) / preview.length)
    : 0;
  const suppliersActive = preview.length;

  return { canManage: true as const, preview, suppliers, locations, productsNeedingReorder, avgLeadTimeDays, suppliersActive };
};

export default function ReorderPlannerPage() {
  const data = useLoaderData<typeof loader>();

  // Selection + quantity edits are lifted here (not kept local to each
  // supplier group) so the page-level "Total to Reorder" stat card can
  // live-recompute as the merchant unchecks rows or edits quantities in any
  // group — a variantId is unique across the whole preview, so one flat map
  // covers every group without collision.
  const [qtyByVariant, setQtyByVariant] = useState<Record<string, number>>(() =>
    Object.fromEntries(data.preview.flatMap((g) => g.lines.map((l) => [l.variantId, l.suggestedQuantity]))),
  );
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(data.preview.flatMap((g) => g.lines.map((l) => l.variantId))),
  );

  const toggleChecked = (variantId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId); else next.add(variantId);
      return next;
    });
  };
  const updateQty = (variantId: string, value: number) => {
    setQtyByVariant((prev) => ({ ...prev, [variantId]: value }));
  };

  if (!data.canManage) {
    return (
      <s-page heading="Reorder Planner" sub-heading="See what needs reordering soon, grouped by supplier">
        <SuppliersUpsellCard />
      </s-page>
    );
  }

  const totalToReorder = Array.from(checked).reduce((sum, id) => sum + (qtyByVariant[id] ?? 0), 0);

  return (
    <s-page heading="Reorder Planner" sub-heading="See what needs reordering soon, grouped by supplier">
      <ReorderPlannerStatCards
        totalToReorder={totalToReorder}
        productsNeedingReorder={data.productsNeedingReorder}
        avgLeadTimeDays={data.avgLeadTimeDays}
        suppliersActive={data.suppliersActive}
      />

      {data.preview.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Nothing needs reordering right now.</p>
          <p style={{ fontSize: 14 }}>
            Products show up here once they&apos;re low enough to stock out before a fresh order from their supplier would arrive.
          </p>
        </div>
      ) : (
        data.preview.map((group) => (
          <ReorderPlannerSupplierGroup
            key={group.supplierId}
            group={group}
            suppliers={data.suppliers}
            locations={data.locations}
            qtyByVariant={qtyByVariant}
            checked={checked}
            onToggleChecked={toggleChecked}
            onQtyChange={updateQty}
          />
        ))
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
