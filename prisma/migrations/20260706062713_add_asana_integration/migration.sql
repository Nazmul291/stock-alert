-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN     "asana_access_token" VARCHAR(500),
ADD COLUMN     "asana_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "asana_refresh_token" VARCHAR(500),
ADD COLUMN     "asana_token_expires_at" TIMESTAMPTZ,
ADD COLUMN     "asana_user_name" VARCHAR(200),
ADD COLUMN     "asana_workspace_gid" VARCHAR(50),
ADD COLUMN     "asana_workspace_name" VARCHAR(200);

-- CreateTable
CREATE TABLE "asana_event_mapping" (
    "id" UUID NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" VARCHAR(20) NOT NULL,
    "project_gid" VARCHAR(50) NOT NULL,
    "project_name" VARCHAR(200) NOT NULL,
    "section_gid" VARCHAR(50),
    "section_name" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "asana_event_mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asana_event_mapping_shop_idx" ON "asana_event_mapping"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "asana_event_mapping_shop_eventType_key" ON "asana_event_mapping"("shop", "eventType");
