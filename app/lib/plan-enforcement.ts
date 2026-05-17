import prisma from '../db.server';
import { getMaxProducts } from './plan-limits';

export async function enforcePlanLimits(shop: string, plan: string) {
  const maxProducts = getMaxProducts(plan);

  const activeProducts = await prisma.inventoryTracking.findMany({
    where: { shop, inventoryStatus: { not: 'deactivated' } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (activeProducts.length <= maxProducts) {
    return { deactivatedCount: 0, activeCount: activeProducts.length, maxAllowed: maxProducts };
  }

  const toDeactivate = activeProducts.slice(maxProducts).map((p) => p.id);
  await prisma.inventoryTracking.updateMany({
    where: { id: { in: toDeactivate } },
    data: { inventoryStatus: 'deactivated' },
  });

  return { deactivatedCount: toDeactivate.length, activeCount: maxProducts, maxAllowed: maxProducts };
}

export async function canAddProduct(shop: string): Promise<{ canAdd: boolean; reason?: string }> {
  const session = await prisma.session.findFirst({ where: { shop, isOnline: false } });
  if (!session) return { canAdd: false, reason: 'Store not found' };

  const maxProducts = getMaxProducts(session.plan ?? 'free');
  const activeCount = await prisma.inventoryTracking.count({
    where: { shop, inventoryStatus: { not: 'deactivated' } },
  });

  if (activeCount >= maxProducts) {
    return { canAdd: false, reason: `Plan limit reached: ${activeCount}/${maxProducts} products. Upgrade to Pro for up to 10,000 products.` };
  }

  return { canAdd: true };
}
