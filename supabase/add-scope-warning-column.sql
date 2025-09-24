-- Add scope-related columns to stores table
-- This tracks any scope-related issues during OAuth and verification status

ALTER TABLE stores
ADD COLUMN IF NOT EXISTS scope_warning TEXT,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN stores.scope_warning IS 'Tracks any scope-related warnings or issues during OAuth installation';
COMMENT ON COLUMN stores.verified_at IS 'Timestamp of last access verification check';