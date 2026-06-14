-- DropIndex
DROP INDEX "inventory_tracking_shop_product_id_idx";

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "digest_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "digest_frequency" TEXT NOT NULL DEFAULT 'weekly',
ADD COLUMN     "last_digest_sent_at" TIMESTAMPTZ;
