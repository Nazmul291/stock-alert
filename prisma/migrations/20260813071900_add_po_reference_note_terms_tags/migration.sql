-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "reference_number" VARCHAR(255),
ADD COLUMN     "supplier_note" TEXT,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "terms" VARCHAR(100);
