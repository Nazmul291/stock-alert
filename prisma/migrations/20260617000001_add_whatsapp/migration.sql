ALTER TABLE "store_settings"
  ADD COLUMN IF NOT EXISTS "whatsapp_notifications"    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whatsapp_phone"            VARCHAR(30),
  ADD COLUMN IF NOT EXISTS "whatsapp_phone_number_id"  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "whatsapp_access_token"     VARCHAR(500);
