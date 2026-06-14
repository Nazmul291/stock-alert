CREATE TABLE "back_in_stock_subscribers" (
  "id" UUID NOT NULL,
  "shop" TEXT NOT NULL,
  "product_id" BIGINT NOT NULL,
  "product_title" VARCHAR(500),
  "email" VARCHAR(255) NOT NULL,
  "subscribed_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "notified_at" TIMESTAMPTZ,
  CONSTRAINT "back_in_stock_subscribers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "back_in_stock_subscribers_shop_product_id_email_key" ON "back_in_stock_subscribers"("shop", "product_id", "email");
CREATE INDEX "back_in_stock_subscribers_shop_idx" ON "back_in_stock_subscribers"("shop");
CREATE INDEX "back_in_stock_subscribers_shop_product_id_idx" ON "back_in_stock_subscribers"("shop", "product_id");

ALTER TABLE "back_in_stock_subscribers" ADD CONSTRAINT "back_in_stock_subscribers_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
