ALTER TABLE "store_settings"
  ADD COLUMN IF NOT EXISTS "outbound_webhook_url" VARCHAR(500);
