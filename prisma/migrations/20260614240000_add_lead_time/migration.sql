ALTER TABLE "store_settings"
  ADD COLUMN IF NOT EXISTS "supplier_lead_time_days" INTEGER NOT NULL DEFAULT 7;
