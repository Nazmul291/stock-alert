-- Create auth_nonces table for OAuth state validation
CREATE TABLE IF NOT EXISTS auth_nonces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_domain VARCHAR(255) NOT NULL,
    nonce VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(nonce)
);

-- Create index for faster lookups
CREATE INDEX idx_auth_nonces_shop_domain ON auth_nonces(shop_domain);
CREATE INDEX idx_auth_nonces_created_at ON auth_nonces(created_at);

-- Clean up old nonces (older than 1 hour)
CREATE OR REPLACE FUNCTION cleanup_old_nonces()
RETURNS void AS $$
BEGIN
    DELETE FROM auth_nonces
    WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql;