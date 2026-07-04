ALTER TABLE "store_settings"
  ADD COLUMN IF NOT EXISTS "slack_team_name"     VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "slack_channel_name"  VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "slack_access_token"  VARCHAR(500);
