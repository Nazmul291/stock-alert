-- CreateTable
CREATE TABLE "inventory_buffer" (
    "id" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_buffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_buffer_eventKey_key" ON "inventory_buffer"("eventKey");

-- CreateIndex
CREATE INDEX "inventory_buffer_shop_idx" ON "inventory_buffer"("shop");

-- CreateIndex
CREATE INDEX "inventory_buffer_updatedAt_idx" ON "inventory_buffer"("updatedAt");
