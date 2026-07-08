import prisma from '../db.server';
import { getMaxProducts } from './plan-limits';
import { countDistinctProducts } from './inventory-rollup.server';

// Statuses that don't count against the plan's product limit: 'deactivated'
// is a merchant manually turning monitoring off, 'requires_upgrade' is this
// module benching a product for being over the cap. Both are excluded from
// the "active" count the same way, but only 'requires_upgrade' is ever
// written here — a downgrade must never look like the merchant's own choice.
const BENCHED_STATUSES = ['deactivated', 'requires_upgrade'] as const;

export async function enforcePlanLimits(shop: string, plan: string | null) {
  const maxProducts = getMaxProducts(plan);

  // Grouped by productId (not row) — a product's variants must be
  // deactivated/restored together, not piecemeal. Ordered by createdAt (when
  // first tracked), not updatedAt — updatedAt gets bumped by every inventory
  // webhook, so ranking by it made the "kept" set shift with unrelated stock
  // activity instead of deterministically keeping whichever products were
  // tracked first.
  const activeGroups = await prisma.inventoryTracking.groupBy({
    by: ['productId'],
    where: { shop, inventoryStatus: { notIn: [...BENCHED_STATUSES] } },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: 'asc' } },
  });

  if (activeGroups.length > maxProducts) {
    // Over the cap — bench the most-recently-tracked products (i.e. keep the
    // first `maxProducts` added) as "requires_upgrade", not "deactivated".
    // That status is reserved for a merchant's own choice; a plan limit is
    // never that.
    const toBenchProductIds = activeGroups.slice(maxProducts).map((g) => g.productId);
    await prisma.inventoryTracking.updateMany({
      where: { shop, productId: { in: toBenchProductIds } },
      data: { inventoryStatus: 'requires_upgrade', monitoringEnabled: false },
    });
    return { deactivatedCount: toBenchProductIds.length, restoredCount: 0, activeCount: maxProducts, maxAllowed: maxProducts };
  }

  if (activeGroups.length === maxProducts) {
    return { deactivatedCount: 0, restoredCount: 0, activeCount: activeGroups.length, maxAllowed: maxProducts };
  }

  // The cap grew (upgrade, or a lapsed subscription came back) — restore
  // previously benched products, oldest-tracked first (same createdAt
  // ordering as above), up to however many slots are now free. Never touches
  // 'deactivated' rows — those stay off until the merchant re-enables them.
  const freeSlots = maxProducts - activeGroups.length;
  const benchedGroups = await prisma.inventoryTracking.groupBy({
    by: ['productId'],
    where: { shop, inventoryStatus: 'requires_upgrade' },
    _min: { createdAt: true },
    orderBy: { _min: { createdAt: 'asc' } },
    take: freeSlots,
  });

  if (benchedGroups.length === 0) {
    return { deactivatedCount: 0, restoredCount: 0, activeCount: activeGroups.length, maxAllowed: maxProducts };
  }

  const settings = await prisma.storeSettings.findUnique({ where: { shop } });
  const threshold = settings?.lowStockThreshold ?? 5;
  const rowsToRestore = await prisma.inventoryTracking.findMany({
    where: { shop, productId: { in: benchedGroups.map((g) => g.productId) } },
    select: { id: true, currentQuantity: true },
  });

  // Per-product custom thresholds live in Shopify metafields, not this table —
  // restored rows use the store-wide threshold as a safe default; the next
  // inventory webhook for each variant corrects it precisely if it differs.
  await Promise.all(
    rowsToRestore.map((r) =>
      prisma.inventoryTracking.update({
        where: { id: r.id },
        data: {
          inventoryStatus: r.currentQuantity <= 0 ? 'out_of_stock' : r.currentQuantity <= threshold ? 'low_stock' : 'in_stock',
          monitoringEnabled: true,
        },
      }),
    ),
  );

  return {
    deactivatedCount: 0,
    restoredCount: benchedGroups.length,
    activeCount: activeGroups.length + benchedGroups.length,
    maxAllowed: maxProducts,
  };
}

export async function canAddProduct(shop: string): Promise<{ canAdd: boolean; reason?: string }> {
  const session = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  if (!session) return { canAdd: false, reason: 'Store not found' };

  const maxProducts = getMaxProducts(session.plan);
  // Distinct products, not tracking rows — a product's variants must never
  // count multiple times against the plan cap.
  const activeCount = await countDistinctProducts({ shop, inventoryStatus: { notIn: [...BENCHED_STATUSES] } });

  if (activeCount >= maxProducts) {
    return { canAdd: false, reason: `Plan limit reached: ${activeCount}/${maxProducts} products. Upgrade to Pro for up to 10,000 products.` };
  }

  return { canAdd: true };
}
