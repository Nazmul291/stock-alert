import prisma from "../db.server";

const PAGE_SIZE = 25;

export type AlertsData = {
  alerts: {
    id: string;
    productTitle: string | null;
    alertType: string | null;
    quantityAtAlert: number | null;
    thresholdTriggered: number | null;
    sentToEmail: string | null;
    sentToSlack: boolean;
    sentAt: string;
  }[];
  total: number;
  totalPages: number;
};

export async function loadAlerts({ shop, page, typeFilter, productSearch }: {
  shop: string; page: number; typeFilter: string; productSearch: string;
}): Promise<AlertsData> {
  const where = {
    shop,
    ...(typeFilter !== "all" ? { alertType: typeFilter as "low_stock" | "out_of_stock" | "restock" } : {}),
    ...(productSearch ? { productTitle: { contains: productSearch, mode: "insensitive" as const } } : {}),
  };

  const [alerts, total] = await Promise.all([
    prisma.alertHistory.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.alertHistory.count({ where }),
  ]);

  return {
    alerts: alerts.map((a) => ({
      id: a.id,
      productTitle: a.productTitle,
      alertType: a.alertType as string | null,
      quantityAtAlert: a.quantityAtAlert,
      thresholdTriggered: a.thresholdTriggered,
      sentToEmail: a.sentToEmail,
      sentToSlack: a.sentToSlack,
      sentAt: a.sentAt.toISOString(),
    })),
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}
