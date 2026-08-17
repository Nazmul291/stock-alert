-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "forecast_mode" TEXT NOT NULL DEFAULT 'smart',
ADD COLUMN     "safety_stock_days" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "min_stock_level" INTEGER;
