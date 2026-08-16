-- AlterTable
ALTER TABLE "inventory_tracking" ADD COLUMN     "vendor" VARCHAR(255);

-- CreateTable
CREATE TABLE "forecast_rule" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scope_type" VARCHAR(20) NOT NULL,
    "scope_value" VARCHAR(255) NOT NULL,
    "basis" VARCHAR(20) NOT NULL,
    "lead_time_days" INTEGER,
    "safety_stock_days" INTEGER,
    "min_stock_level" INTEGER,
    "season_start" INTEGER,
    "season_end" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "forecast_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_collection_member" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "collection_id" VARCHAR(50) NOT NULL,
    "product_id" BIGINT NOT NULL,
    "refreshed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_collection_member_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_vendor_idx" ON "inventory_tracking"("shop", "vendor");

-- CreateIndex
CREATE INDEX "forecast_rule_shop_idx" ON "forecast_rule"("shop");

-- CreateIndex
CREATE INDEX "forecast_rule_shop_enabled_idx" ON "forecast_rule"("shop", "enabled");

-- CreateIndex
CREATE INDEX "forecast_collection_member_shop_collection_id_idx" ON "forecast_collection_member"("shop", "collection_id");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_collection_member_shop_collection_id_product_id_key" ON "forecast_collection_member"("shop", "collection_id", "product_id");

-- AddForeignKey
ALTER TABLE "forecast_rule" ADD CONSTRAINT "forecast_rule_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_collection_member" ADD CONSTRAINT "forecast_collection_member_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
