CREATE TABLE IF NOT EXISTS "sync_state" (
  "shop"             TEXT         NOT NULL,
  "running"          BOOLEAN      NOT NULL DEFAULT false,
  "progress"         INTEGER      NOT NULL DEFAULT 0,
  "started_at"       TIMESTAMPTZ  NOT NULL,
  "completed_at"     TIMESTAMPTZ,
  "synced_count"     INTEGER,
  "error"            TEXT,
  "last_webhook_at"  TIMESTAMPTZ,
  "updated_at"       TIMESTAMPTZ  NOT NULL,

  CONSTRAINT "sync_state_pkey" PRIMARY KEY ("shop")
);
