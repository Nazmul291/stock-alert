-- CreateTable
CREATE TABLE "inventory_item_map" (
    "inventory_item_id" BIGINT NOT NULL,
    "shop" TEXT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "variant_id" BIGINT NOT NULL,
    "monitoring_enabled" BOOLEAN NOT NULL DEFAULT true,
    "plan" "Plan",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_item_map_pkey" PRIMARY KEY ("inventory_item_id")
);

-- CreateIndex
CREATE INDEX "inventory_item_map_shop_idx" ON "inventory_item_map"("shop");

-- CreateIndex
CREATE INDEX "inventory_item_map_shop_variant_id_idx" ON "inventory_item_map"("shop", "variant_id");

-- AddForeignKey
ALTER TABLE "inventory_item_map" ADD CONSTRAINT "inventory_item_map_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
