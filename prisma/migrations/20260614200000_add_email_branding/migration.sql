ALTER TABLE "store_settings"
  ADD COLUMN IF NOT EXISTS "brand_logo_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "brand_color" VARCHAR(7),
  ADD COLUMN IF NOT EXISTS "brand_sender_name" VARCHAR(100);
