-- DropIndex
DROP INDEX "inventory_tracking_product_title_trgm_idx";

-- DropIndex
DROP INDEX "inventory_tracking_sku_trgm_idx";

-- CreateIndex
CREATE INDEX "alert_history_shop_product_id_idx" ON "alert_history"("shop", "product_id");
