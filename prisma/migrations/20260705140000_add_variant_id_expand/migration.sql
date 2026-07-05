-- Expand step of the variant-level tracking migration (see plan doc).
-- Additive only — no existing code reads/writes variant_id yet, so this is
-- safe to deploy alone with zero behavior change. Phase 2 (backfill script)
-- populates variant_id; Phase 3 (separate migration + code cutover) enforces
-- NOT NULL and swaps the unique constraint from (shop, product_id) to
-- (shop, variant_id).

ALTER TABLE "inventory_tracking"
  ADD COLUMN IF NOT EXISTS "variant_id" BIGINT;

-- Re-add the (shop, product_id) index dropped in 20260613195255_add_digest_fields
-- as redundant with the old unique index — it'll be needed again for
-- per-product rollup queries once product_id is no longer part of the
-- unique key.
CREATE INDEX IF NOT EXISTS "inventory_tracking_shop_product_id_idx"
  ON "inventory_tracking" ("shop", "product_id");

ALTER TABLE "alert_history"
  ADD COLUMN IF NOT EXISTS "variant_id" BIGINT,
  ADD COLUMN IF NOT EXISTS "variant_title" VARCHAR(500);

ALTER TABLE "inventory_buffer"
  ADD COLUMN IF NOT EXISTS "variant_id" TEXT;
