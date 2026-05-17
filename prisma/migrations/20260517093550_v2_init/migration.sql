-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('low_stock', 'out_of_stock', 'restock');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'deactivated');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" VARCHAR(255),
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),
    "plan" "Plan" NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 5,
    "auto_hide_enabled" BOOLEAN NOT NULL DEFAULT false,
    "email_notifications" BOOLEAN NOT NULL DEFAULT true,
    "slack_notifications" BOOLEAN NOT NULL DEFAULT false,
    "notification_email" VARCHAR(255),
    "slack_webhook_url" TEXT,
    "auto_republish_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_settings" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "custom_threshold" INTEGER,
    "exclude_from_auto_hide" BOOLEAN NOT NULL DEFAULT false,
    "exclude_from_alerts" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_tracking" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "product_title" VARCHAR(500),
    "variant_title" VARCHAR(500),
    "sku" VARCHAR(255),
    "current_quantity" INTEGER NOT NULL DEFAULT 0,
    "previous_quantity" INTEGER,
    "last_checked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_alert_sent_at" TIMESTAMPTZ,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "inventory_status" "InventoryStatus" NOT NULL DEFAULT 'in_stock',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_tracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_history" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "product_id" BIGINT,
    "product_title" VARCHAR(500),
    "alert_type" "AlertType",
    "quantity_at_alert" INTEGER,
    "threshold_triggered" INTEGER,
    "sent_to_email" VARCHAR(255),
    "sent_to_slack" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_progress" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "app_installed" BOOLEAN NOT NULL DEFAULT true,
    "global_settings_configured" BOOLEAN NOT NULL DEFAULT false,
    "notifications_configured" BOOLEAN NOT NULL DEFAULT false,
    "product_thresholds_configured" BOOLEAN NOT NULL DEFAULT false,
    "first_product_tracked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "setup_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "webhook_id" BIGINT NOT NULL,
    "topic" VARCHAR(100) NOT NULL,
    "address" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_nonces" (
    "id" UUID NOT NULL,
    "nonce" VARCHAR(255) NOT NULL,
    "shop" VARCHAR(255) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),

    CONSTRAINT "auth_nonces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" VARCHAR(100) NOT NULL,
    "payload" JSONB,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMPTZ,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_item_mapping" (
    "inventory_item_id" BIGINT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "variant_id" BIGINT,
    "shop" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "inventory_item_mapping_pkey" PRIMARY KEY ("inventory_item_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_shop_key" ON "Session"("shop");

-- CreateIndex
CREATE INDEX "Session_plan_idx" ON "Session"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_shop_key" ON "store_settings"("shop");

-- CreateIndex
CREATE INDEX "store_settings_shop_idx" ON "store_settings"("shop");

-- CreateIndex
CREATE INDEX "product_settings_shop_product_id_idx" ON "product_settings"("shop", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_settings_shop_product_id_key" ON "product_settings"("shop", "product_id");

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_idx" ON "inventory_tracking"("shop");

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_product_id_idx" ON "inventory_tracking"("shop", "product_id");

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_current_quantity_idx" ON "inventory_tracking"("shop", "current_quantity");

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_is_hidden_idx" ON "inventory_tracking"("shop", "is_hidden");

-- CreateIndex
CREATE INDEX "inventory_tracking_last_checked_at_idx" ON "inventory_tracking"("last_checked_at");

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_last_alert_sent_at_idx" ON "inventory_tracking"("shop", "last_alert_sent_at");

-- CreateIndex
CREATE INDEX "inventory_tracking_shop_inventory_status_idx" ON "inventory_tracking"("shop", "inventory_status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_tracking_shop_product_id_key" ON "inventory_tracking"("shop", "product_id");

-- CreateIndex
CREATE INDEX "alert_history_shop_idx" ON "alert_history"("shop");

-- CreateIndex
CREATE INDEX "alert_history_sent_at_idx" ON "alert_history"("sent_at" DESC);

-- CreateIndex
CREATE INDEX "alert_history_shop_sent_at_idx" ON "alert_history"("shop", "sent_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "setup_progress_shop_key" ON "setup_progress"("shop");

-- CreateIndex
CREATE INDEX "setup_progress_shop_idx" ON "setup_progress"("shop");

-- CreateIndex
CREATE INDEX "webhooks_shop_idx" ON "webhooks"("shop");

-- CreateIndex
CREATE INDEX "webhooks_topic_idx" ON "webhooks"("topic");

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_shop_topic_key" ON "webhooks"("shop", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "auth_nonces_nonce_key" ON "auth_nonces"("nonce");

-- CreateIndex
CREATE INDEX "auth_nonces_nonce_idx" ON "auth_nonces"("nonce");

-- CreateIndex
CREATE INDEX "auth_nonces_expires_at_idx" ON "auth_nonces"("expires_at");

-- CreateIndex
CREATE INDEX "webhook_events_shop_processed_idx" ON "webhook_events"("shop", "processed");

-- CreateIndex
CREATE INDEX "webhook_events_topic_idx" ON "webhook_events"("topic");

-- CreateIndex
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_item_mapping_shop_inventory_item_id_idx" ON "inventory_item_mapping"("shop", "inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_item_mapping_shop_product_id_idx" ON "inventory_item_mapping"("shop", "product_id");

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_settings" ADD CONSTRAINT "product_settings_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_tracking" ADD CONSTRAINT "inventory_tracking_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_progress" ADD CONSTRAINT "setup_progress_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_item_mapping" ADD CONSTRAINT "inventory_item_mapping_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;
