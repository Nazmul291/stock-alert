-- DropIndex
DROP INDEX "purchase_order_line_items_purchase_order_id_variant_id_key";

-- AlterTable
ALTER TABLE "purchase_order_line_items" ADD COLUMN     "location_id" VARCHAR(50),
ADD COLUMN     "location_name" VARCHAR(200);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_line_items_purchase_order_id_variant_id_loca_key" ON "purchase_order_line_items"("purchase_order_id", "variant_id", "location_id");

