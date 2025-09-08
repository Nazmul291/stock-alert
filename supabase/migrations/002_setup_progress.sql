-- Create setup_progress table
CREATE TABLE IF NOT EXISTS setup_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    app_installed BOOLEAN DEFAULT true,
    global_settings_configured BOOLEAN DEFAULT false,
    notifications_configured BOOLEAN DEFAULT false,
    product_thresholds_configured BOOLEAN DEFAULT false,
    first_product_tracked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id)
);

-- Create index for store_id
CREATE INDEX IF NOT EXISTS idx_setup_progress_store_id ON setup_progress(store_id);

-- Add RLS policies
ALTER TABLE setup_progress ENABLE ROW LEVEL SECURITY;

-- Policy for stores to read and update their own setup progress
CREATE POLICY "Stores can view and update their own setup progress" ON setup_progress
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_setup_progress_updated_at BEFORE UPDATE ON setup_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default setup progress for existing stores
INSERT INTO setup_progress (store_id, app_installed)
SELECT id, true FROM stores
WHERE NOT EXISTS (
    SELECT 1 FROM setup_progress WHERE setup_progress.store_id = stores.id
);