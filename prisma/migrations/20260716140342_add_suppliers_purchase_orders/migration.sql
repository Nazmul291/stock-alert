-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

-- AlterTable
ALTER TABLE "inventory_tracking" ADD COLUMN     "supplier_id" UUID,
ADD COLUMN     "unit_cost" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "lead_time_days" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "supplier_id" UUID NOT NULL,
    "po_number" INTEGER NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "total_cost" DOUBLE PRECISION,
    "generated_from_forecast" BOOLEAN NOT NULL DEFAULT true,
    "sent_to_supplier_at" TIMESTAMPTZ,
    "ordered_at" TIMESTAMPTZ,
    "received_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line_items" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_id" BIGINT NOT NULL,
    "variant_id" BIGINT NOT NULL,
    "product_title" VARCHAR(500),
    "variant_title" VARCHAR(500),
    "sku" VARCHAR(255),
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_received" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_shop_idx" ON "suppliers"("shop");

-- CreateIndex
CREATE INDEX "purchase_orders_shop_idx" ON "purchase_orders"("shop");

-- CreateIndex
CREATE INDEX "purchase_orders_shop_status_idx" ON "purchase_orders"("shop", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_shop_po_number_key" ON "purchase_orders"("shop", "po_number");

-- CreateIndex
CREATE INDEX "purchase_order_line_items_purchase_order_id_idx" ON "purchase_order_line_items"("purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_line_items_purchase_order_id_variant_id_key" ON "purchase_order_line_items"("purchase_order_id", "variant_id");

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_supplier_id_idx" ON "inventory_tracking"("shop", "supplier_id");

-- AddForeignKey
ALTER TABLE "inventory_tracking" ADD CONSTRAINT "inventory_tracking_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line_items" ADD CONSTRAINT "purchase_order_line_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
