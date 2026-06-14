ALTER TABLE "inventory_tracking"
  ADD COLUMN IF NOT EXISTS "avg_daily_sales" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "stock_out_days" INTEGER;
