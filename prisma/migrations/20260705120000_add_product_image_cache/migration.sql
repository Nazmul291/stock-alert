ALTER TABLE "inventory_tracking"
  ADD COLUMN IF NOT EXISTS "image_url" TEXT,
  ADD COLUMN IF NOT EXISTS "image_alt" TEXT;
