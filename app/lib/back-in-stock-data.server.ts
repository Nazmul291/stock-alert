import prisma from "../db.server";

const PAGE_SIZE = 50;

export type BackInStockData = {
  subscribers: {
    id: string;
    productId: string;
    productTitle: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    subscribedAt: string;
    notifiedAt: string | null;
  }[];
  total: number;
  pendingCount: number;
  notifiedCount: number;
  totalPages: number;
  productGroups: { productId: string; productTitle: string | null; count: number; expectedRestockDate: string | null }[];
};

export async function loadBackInStockData({ shop, page }: { shop: string; page: number }): Promise<BackInStockData> {
  const [rows, total, pendingCount, notifiedCount, productGroups, restockDates] = await Promise.all([
    prisma.backInStockSubscriber.findMany({
      where: { shop },
      orderBy: { subscribedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        productId: true,
        productTitle: true,
        email: true,
        firstName: true,
        lastName: true,
        subscribedAt: true,
        notifiedAt: true,
      },
    }),
    prisma.backInStockSubscriber.count({ where: { shop } }),
    prisma.backInStockSubscriber.count({ where: { shop, notifiedAt: null } }),
    prisma.backInStockSubscriber.count({ where: { shop, notifiedAt: { not: null } } }),
    prisma.backInStockSubscriber.groupBy({
      by: ["productId", "productTitle"],
      where: { shop },
      _count: { _all: true },
      orderBy: { _count: { email: "desc" } },
    }),
    prisma.inventoryTracking.findMany({
      where: { shop },
      select: { productId: true, expectedRestockDate: true },
    }),
  ]);

  return {
    subscribers: rows.map((r) => ({
      id: r.id,
      productId: r.productId.toString(),
      productTitle: r.productTitle,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      subscribedAt: r.subscribedAt.toISOString(),
      notifiedAt: r.notifiedAt?.toISOString() ?? null,
    })),
    total,
    pendingCount,
    notifiedCount,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    productGroups: productGroups.map((g) => {
      const rd = restockDates.find((r) => r.productId === g.productId);
      return {
        productId: g.productId.toString(),
        productTitle: g.productTitle,
        count: g._count._all,
        expectedRestockDate: rd?.expectedRestockDate?.toISOString().slice(0, 10) ?? null,
      };
    }),
  };
}
