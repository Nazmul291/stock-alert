-- Contract step of the variant-level tracking migration (see plan doc).
-- Ships together with the Phase 3 code cutover (sync/webhooks/etc rewritten
-- to key on variantId) — every "shop_productId" Prisma call site becomes a
-- compile error the moment this lands, by design (forces one atomic deploy).
-- Phase 2's backfill script already guaranteed every row has a variant_id.

ALTER TABLE "inventory_tracking"
  ALTER COLUMN "variant_id" SET NOT NULL;

DROP INDEX IF EXISTS "inventory_tracking_shop_product_id_key";

CREATE UNIQUE INDEX "inventory_tracking_shop_variant_id_key"
  ON "inventory_tracking" ("shop", "variant_id");
