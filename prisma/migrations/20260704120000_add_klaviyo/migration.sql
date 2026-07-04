ALTER TABLE "store_settings"
  ADD COLUMN IF NOT EXISTS "klaviyo_enabled"  BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "klaviyo_api_key"  VARCHAR(500);
