ALTER TABLE "store_settings"
  ADD COLUMN IF NOT EXISTS "monitoring_filter" VARCHAR(20) NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS "monitoring_collection_id" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "monitoring_tags" VARCHAR(500);
