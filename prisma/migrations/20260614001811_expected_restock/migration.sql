-- AlterTable
ALTER TABLE "back_in_stock_subscribers" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "store_settings" ALTER COLUMN "monitoring_filter" SET DATA TYPE TEXT;
