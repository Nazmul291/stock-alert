-- =============================================
-- GDPR Requests Tracking Table
-- =============================================
-- This table tracks all GDPR-related requests for compliance purposes
-- Required for maintaining an audit trail of data requests and deletions

CREATE TABLE IF NOT EXISTS gdpr_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_domain VARCHAR(255) NOT NULL,
    request_type VARCHAR(50) NOT NULL, -- 'customers_data_request', 'customers_redact', 'shop_redact'
    customer_id VARCHAR(255),
    request_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    response TEXT,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_shop_domain ON gdpr_requests(shop_domain);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_request_type ON gdpr_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status ON gdpr_requests(status);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_created_at ON gdpr_requests(created_at DESC);

-- Add comment for documentation
COMMENT ON TABLE gdpr_requests IS 'Tracks all GDPR compliance requests including customer data requests, customer data deletion, and shop data deletion for audit purposes';

-- =============================================
-- Row Level Security (RLS) Policies
-- =============================================

-- Enable RLS on the table
ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;

-- Policy 1: Service role has full access (for webhook handlers)
CREATE POLICY "Service role has full access to gdpr_requests"
    ON gdpr_requests
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Policy 2: Stores can view their own GDPR requests
CREATE POLICY "Stores can view their own GDPR requests"
    ON gdpr_requests
    FOR SELECT
    TO authenticated
    USING (
        shop_domain IN (
            SELECT shop_domain
            FROM stores
            WHERE id = auth.uid()
        )
    );

-- Policy 3: System can insert GDPR requests (for webhooks)
CREATE POLICY "System can insert GDPR requests"
    ON gdpr_requests
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        -- Only allow inserts with valid shop domains that exist in stores table
        shop_domain IN (SELECT shop_domain FROM stores)
    );

-- Policy 4: No one can update GDPR requests (immutable audit log)
-- No UPDATE policy means updates are denied by default

-- Policy 5: No one can delete GDPR requests (permanent audit trail)
-- No DELETE policy means deletes are denied by default

-- =============================================
-- Additional Security Measures
-- =============================================

-- Create a function to automatically set processed_at when status changes to 'completed'
CREATE OR REPLACE FUNCTION update_gdpr_request_processed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        NEW.processed_at = TIMEZONE('utc', NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update processed_at
CREATE TRIGGER gdpr_request_processed_at_trigger
    BEFORE UPDATE ON gdpr_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_gdpr_request_processed_at();

-- Grant necessary permissions
GRANT ALL ON gdpr_requests TO service_role;
GRANT SELECT ON gdpr_requests TO authenticated;
GRANT INSERT ON gdpr_requests TO anon, authenticated;

-- Note: UPDATE and DELETE are intentionally not granted to maintain audit integrity