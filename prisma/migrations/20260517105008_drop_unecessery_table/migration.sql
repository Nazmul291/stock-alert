/*
  Warnings:

  - You are about to drop the `auth_nonces` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `inventory_item_mapping` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `product_settings` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `webhook_events` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `webhooks` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "inventory_item_mapping" DROP CONSTRAINT "inventory_item_mapping_shop_fkey";

-- DropForeignKey
ALTER TABLE "product_settings" DROP CONSTRAINT "product_settings_shop_fkey";

-- DropForeignKey
ALTER TABLE "webhook_events" DROP CONSTRAINT "webhook_events_shop_fkey";

-- DropForeignKey
ALTER TABLE "webhooks" DROP CONSTRAINT "webhooks_shop_fkey";

-- DropTable
DROP TABLE "auth_nonces";

-- DropTable
DROP TABLE "inventory_item_mapping";

-- DropTable
DROP TABLE "product_settings";

-- DropTable
DROP TABLE "webhook_events";

-- DropTable
DROP TABLE "webhooks";
