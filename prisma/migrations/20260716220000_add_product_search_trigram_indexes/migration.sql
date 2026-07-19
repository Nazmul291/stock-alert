-- Hand-written (not schema.prisma-driven): trigram search indexes so
-- searchTrackedProducts()'s `contains` lookup on product title/SKU
-- (app/lib/purchase-order.server.ts) stays fast regardless of catalog size.
-- Deliberately not modeled via Prisma's `postgresqlExtensions` preview
-- feature — enabling that on this Supabase database makes Prisma's drift
-- detection try to reconcile Supabase's own pre-installed extensions
-- (pg_stat_statements, pgcrypto, supabase_vault, uuid-ossp), which aren't in
-- our migration history, and it demands a full schema reset to "fix" that.
-- Applying this as plain SQL avoids that entirely; Postgres uses the index
-- automatically regardless of whether Prisma's schema model knows about it.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "inventory_tracking_product_title_trgm_idx"
  ON "inventory_tracking" USING GIN ("product_title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "inventory_tracking_sku_trgm_idx"
  ON "inventory_tracking" USING GIN ("sku" gin_trgm_ops);
