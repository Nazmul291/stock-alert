-- @@unique([shop, productId]) already creates an index on (shop, productId).
-- The explicit @@index([shop, productId]) was a duplicate wasting storage and write overhead.
DROP INDEX IF EXISTS "inventory_tracking_shop_productId_idx";
