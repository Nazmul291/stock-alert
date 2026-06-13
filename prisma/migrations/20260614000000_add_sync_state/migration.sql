CREATE TABLE "sync_state" (
  "shop"         TEXT         NOT NULL,
  "running"      BOOLEAN      NOT NULL DEFAULT false,
  "progress"     INTEGER      NOT NULL DEFAULT 0,
  "started_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ,
  "synced_count" INTEGER,
  "error"        TEXT,
  "updated_at"   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "sync_state_pkey" PRIMARY KEY ("shop")
);
