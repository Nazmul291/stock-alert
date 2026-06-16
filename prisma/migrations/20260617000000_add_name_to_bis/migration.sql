ALTER TABLE "back_in_stock_subscribers"
  ADD COLUMN IF NOT EXISTS "first_name" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "last_name"  VARCHAR(100);
