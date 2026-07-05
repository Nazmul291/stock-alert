import prisma from '../db.server';
import { getMaxProducts } from './plan-limits';
import { countDistinctProducts } from './inventory-rollup.server';

export async function enforcePlanLimits(shop: string, plan: string | null) {
  const maxProducts = getMaxProducts(plan);

  // Grouped by productId (not row) — a product's variants must be deactivated
  // together, not piecemeal, or a product would end up partially deactivated.
  const productGroups = await prisma.inventoryTracking.groupBy({
    by: ['productId'],
    where: { shop, inventoryStatus: { not: 'deactivated' } },
    _max: { updatedAt: true },
    orderBy: { _max: { updatedAt: 'desc' } },
  });

  if (productGroups.length <= maxProducts) {
    return { deactivatedCount: 0, activeCount: productGroups.length, maxAllowed: maxProducts };
  }

  const toDeactivateProductIds = productGroups.slice(maxProducts).map((g) => g.productId);
  await prisma.inventoryTracking.updateMany({
    where: { shop, productId: { in: toDeactivateProductIds } },
    data: { inventoryStatus: 'deactivated', monitoringEnabled: false },
  });

  return { deactivatedCount: toDeactivateProductIds.length, activeCount: maxProducts, maxAllowed: maxProducts };
}

export async function canAddProduct(shop: string): Promise<{ canAdd: boolean; reason?: string }> {
  const session = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  if (!session) return { canAdd: false, reason: 'Store not found' };

  const maxProducts = getMaxProducts(session.plan);
  // Distinct products, not tracking rows — a product's variants must never
  // count multiple times against the plan cap.
  const activeCount = await countDistinctProducts({ shop, inventoryStatus: { not: 'deactivated' } });

  if (activeCount >= maxProducts) {
    return { canAdd: false, reason: `Plan limit reached: ${activeCount}/${maxProducts} products. Upgrade to Pro for up to 10,000 products.` };
  }

  return { canAdd: true };
}
