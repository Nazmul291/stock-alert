-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('basic', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('low_stock', 'out_of_stock', 'restock');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'deactivated');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('ADMIN', 'SUPPORT_AGENT');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('OPEN', 'ENDED');

-- CreateEnum
CREATE TYPE "ChatSender" AS ENUM ('MERCHANT', 'ADMIN', 'BOT');

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
    "plan" "Plan" NOT NULL DEFAULT 'basic',
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
    "monitoring_enabled" BOOLEAN NOT NULL DEFAULT true,
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
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'SUPPORT_AGENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "merchantEmail" TEXT,
    "status" "ChatStatus" NOT NULL DEFAULT 'OPEN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "assignedToId" TEXT,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "ChatSender" NOT NULL,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_tracking" ADD CONSTRAINT "inventory_tracking_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_history" ADD CONSTRAINT "alert_history_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setup_progress" ADD CONSTRAINT "setup_progress_shop_fkey" FOREIGN KEY ("shop") REFERENCES "Session"("shop") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
