-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "alert_batch_hour" INTEGER NOT NULL DEFAULT 23,
ADD COLUMN     "digest_day_of_week" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "digest_hour" INTEGER NOT NULL DEFAULT 8;
