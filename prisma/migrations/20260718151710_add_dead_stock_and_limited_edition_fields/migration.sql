-- AlterTable
ALTER TABLE "inventory_tracking" ADD COLUMN     "tags" VARCHAR(1000),
ADD COLUMN     "zero_sales_since_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "dead_stock_threshold_days" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "limited_edition_tag" VARCHAR(100);

-- Rows already reading zero velocity start their "days dead" clock from the
-- last time we actually confirmed that (velocity_updated_at), not from
-- migration time — otherwise every already-dead product needs a full fresh
-- 30/60/90-day wait post-deploy before ever surfacing as dead stock.
UPDATE "inventory_tracking"
SET "zero_sales_since_at" = "velocity_updated_at"
WHERE "avg_daily_sales" = 0 AND "velocity_updated_at" IS NOT NULL;
