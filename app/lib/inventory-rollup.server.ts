import prisma from "../db.server";
import { Prisma } from "@prisma/client";

// Now that InventoryTracking has one row per variant, "product-level" status
// and counts have to be rolled up across a product's sibling variant rows.
// This module is the single place that classification logic lives, so the
// DB-driven and in-memory code paths (products-data.server.ts has both)
// always agree on what counts as "at risk".

export type RollupStatus = "in_stock" | "low_stock" | "out_of_stock" | "deactivated" | "requires_upgrade";

// Worst-case status across a product's variants:
// - "deactivated" only when every variant was manually turned off by the merchant.
// - "requires_upgrade" only when every variant was benched by plan-limit
//   enforcement (see plan-enforcement.ts) — distinct from "deactivated" so the
//   UI can tell "merchant turned this off" apart from "over the plan limit".
//   A product's variants are always moved between these together (grouped by
//   productId), so "every" is safe here — never a partial mix.
// - "out_of_stock" only when every other variant is out of stock — matches
//   the auto-hide semantics in webhooks.inventory.tsx (archiving only happens
//   when the whole product has nothing left to sell).
// - "low_stock" when any variant is low/out but not all are out.
// - "in_stock" otherwise.
export function classifyProductStatus(variantStatuses: string[]): RollupStatus {
  if (variantStatuses.length === 0) return "in_stock";
  if (variantStatuses.every((s) => s === "deactivated")) return "deactivated";
  if (variantStatuses.every((s) => s === "requires_upgrade")) return "requires_upgrade";

  const relevant = variantStatuses.filter((s) => s !== "deactivated" && s !== "requires_upgrade");
  if (relevant.every((s) => s === "out_of_stock")) return "out_of_stock";
  if (relevant.some((s) => s === "out_of_stock" || s === "low_stock")) return "low_stock";
  return "in_stock";
}

// Product-level status counts (dashboard tiles, analytics "stock health").
export async function rollupStatusCounts(shop: string): Promise<Map<RollupStatus, number>> {
  const rows = await prisma.$queryRaw<{ status: RollupStatus; count: number }[]>`
    SELECT status, COUNT(*)::int AS count FROM (
      SELECT product_id,
        CASE
          WHEN bool_and(inventory_status = 'deactivated') THEN 'deactivated'
          WHEN bool_and(inventory_status = 'requires_upgrade') THEN 'requires_upgrade'
          WHEN bool_and(inventory_status IN ('out_of_stock', 'deactivated', 'requires_upgrade')) THEN 'out_of_stock'
          WHEN bool_or(inventory_status IN ('out_of_stock', 'low_stock')) THEN 'low_stock'
          ELSE 'in_stock'
        END AS status
      FROM inventory_tracking
      WHERE shop = ${shop}
      GROUP BY product_id
    ) t
    GROUP BY status
  `;
  return new Map(rows.map((r) => [r.status, Number(r.count)]));
}

// One representative row per at-risk product (its single worst variant) —
// used by the dashboard's "Products at Risk" widget and the digest email's
// at-risk list, so a product with several bad variants doesn't appear
// multiple times.
export async function atRiskRepresentativeRows(shop: string, limit: number, onlyMonitoringEnabled = false): Promise<{
  productId: bigint;
  productTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  inventoryStatus: string;
}[]> {
  const monitoringFilter = onlyMonitoringEnabled ? Prisma.sql`AND monitoring_enabled = true` : Prisma.empty;
  return prisma.$queryRaw`
    SELECT * FROM (
      SELECT DISTINCT ON (product_id)
        product_id AS "productId", product_title AS "productTitle", sku, current_quantity AS "currentQuantity", inventory_status AS "inventoryStatus"
      FROM inventory_tracking
      WHERE shop = ${shop} AND inventory_status IN ('out_of_stock', 'low_stock') ${monitoringFilter}
      ORDER BY product_id,
        CASE inventory_status WHEN 'out_of_stock' THEN 0 WHEN 'low_stock' THEN 1 ELSE 2 END,
        current_quantity ASC
    ) t
    ORDER BY CASE "inventoryStatus" WHEN 'out_of_stock' THEN 0 WHEN 'low_stock' THEN 1 ELSE 2 END, "currentQuantity" ASC
    LIMIT ${limit}
  `;
}

// Distinct product count matching a filter — a product with N tracked
// variants must count once against the plan limit / "tracked" stat, not N times.
export async function countDistinctProducts(where: Prisma.InventoryTrackingWhereInput): Promise<number> {
  const groups = await prisma.inventoryTracking.groupBy({ by: ["productId"], where });
  return groups.length;
}

// Paginates distinct products by worst-case status (the same classification
// rollupStatusCounts uses), for the Products page's status-filter tabs — so
// a tab's results always match the dashboard tile counts. Returns the total
// matching-product count alongside the page via a window function, avoiding
// a second round-trip.
export async function paginatedProductIdsByStatus(
  shop: string,
  filter: RollupStatus | "tracked",
  search: string,
  skip: number,
  take: number,
): Promise<{ productIds: bigint[]; total: number }> {
  const searchFilter = search ? Prisma.sql`AND product_title ILIKE ${"%" + search + "%"}` : Prisma.empty;
  const statusFilter =
    filter === "tracked" ? Prisma.sql`status NOT IN ('deactivated', 'requires_upgrade')` : Prisma.sql`status = ${filter}`;

  const rows = await prisma.$queryRaw<{ product_id: bigint; total: bigint }[]>`
    SELECT product_id, COUNT(*) OVER()::bigint AS total FROM (
      SELECT product_id,
        CASE
          WHEN bool_and(inventory_status = 'deactivated') THEN 'deactivated'
          WHEN bool_and(inventory_status = 'requires_upgrade') THEN 'requires_upgrade'
          WHEN bool_and(inventory_status IN ('out_of_stock', 'deactivated', 'requires_upgrade')) THEN 'out_of_stock'
          WHEN bool_or(inventory_status IN ('out_of_stock', 'low_stock')) THEN 'low_stock'
          ELSE 'in_stock'
        END AS status
      FROM inventory_tracking
      WHERE shop = ${shop} ${searchFilter}
      GROUP BY product_id
    ) t
    WHERE ${statusFilter}
    ORDER BY product_id ASC
    LIMIT ${take} OFFSET ${skip}
  `;

  return {
    productIds: rows.map((r) => r.product_id),
    total: rows.length > 0 ? Number(rows[0].total) : 0,
  };
}
