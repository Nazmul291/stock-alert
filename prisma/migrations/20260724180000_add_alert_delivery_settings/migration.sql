-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "alert_delivery_mode" TEXT NOT NULL DEFAULT 'instant',
ADD COLUMN     "last_alert_batch_sent_at" TIMESTAMPTZ,
ADD COLUMN     "low_stock_muted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "out_of_stock_muted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restock_muted" BOOLEAN NOT NULL DEFAULT false;

