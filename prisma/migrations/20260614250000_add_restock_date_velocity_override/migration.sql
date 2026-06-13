ALTER TABLE "inventory_tracking"
  ADD COLUMN IF NOT EXISTS "manual_daily_sales" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "expected_restock_date" TIMESTAMPTZ;
