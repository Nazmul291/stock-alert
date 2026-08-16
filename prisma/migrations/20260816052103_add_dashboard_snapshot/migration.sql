-- CreateTable
CREATE TABLE "dashboard_snapshot" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_products" INTEGER NOT NULL,
    "in_stock" INTEGER NOT NULL,
    "low_stock" INTEGER NOT NULL,
    "out_of_stock" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_snapshot_shop_idx" ON "dashboard_snapshot"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_snapshot_shop_date_key" ON "dashboard_snapshot"("shop", "date");

-- AddForeignKey
ALTER TABLE "dashboard_snapshot" ADD CONSTRAINT "dashboard_snapshot_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
