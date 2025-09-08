-- Create tables for Stock Alert Shopify App

-- Stores table
CREATE TABLE IF NOT EXISTS stores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_domain VARCHAR(255) UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    scope VARCHAR(500),
    plan VARCHAR(50) DEFAULT 'free', -- 'free' or 'pro'
    email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Store settings table
CREATE TABLE IF NOT EXISTS store_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    auto_hide_enabled BOOLEAN DEFAULT true,
    auto_republish_enabled BOOLEAN DEFAULT false,
    low_stock_threshold INTEGER DEFAULT 5,
    email_notifications BOOLEAN DEFAULT true,
    slack_notifications BOOLEAN DEFAULT false,
    slack_webhook_url TEXT,
    notification_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id)
);

-- Product settings table (for per-product overrides)
CREATE TABLE IF NOT EXISTS product_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    product_title VARCHAR(500),
    custom_threshold INTEGER,
    exclude_from_auto_hide BOOLEAN DEFAULT false,
    exclude_from_alerts BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id, product_id)
);

-- Inventory tracking table
CREATE TABLE IF NOT EXISTS inventory_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    variant_id BIGINT NOT NULL,
    product_title VARCHAR(500),
    variant_title VARCHAR(500),
    sku VARCHAR(255),
    current_quantity INTEGER DEFAULT 0,
    previous_quantity INTEGER,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    last_alert_sent_at TIMESTAMP WITH TIME ZONE,
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id, variant_id)
);

-- Alert history table
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    variant_id BIGINT,
    alert_type VARCHAR(50), -- 'low_stock', 'out_of_stock', 'restocked'
    alert_channel VARCHAR(50), -- 'email', 'slack'
    quantity_at_alert INTEGER,
    threshold_at_alert INTEGER,
    message TEXT,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Webhook events table (for tracking and debugging)
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    topic VARCHAR(255),
    payload JSONB,
    processed BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    processed_at TIMESTAMP WITH TIME ZONE
);

-- Billing records table
CREATE TABLE IF NOT EXISTS billing_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    charge_id BIGINT UNIQUE,
    plan VARCHAR(50),
    status VARCHAR(50),
    amount DECIMAL(10, 2),
    currency VARCHAR(10),
    billing_on DATE,
    activated_on TIMESTAMP WITH TIME ZONE,
    cancelled_on TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create indexes for better performance
CREATE INDEX idx_stores_shop_domain ON stores(shop_domain);
CREATE INDEX idx_inventory_tracking_store_product ON inventory_tracking(store_id, product_id);
CREATE INDEX idx_inventory_tracking_quantity ON inventory_tracking(current_quantity);
CREATE INDEX idx_alert_history_store_sent ON alert_history(store_id, sent_at);
CREATE INDEX idx_webhook_events_store_processed ON webhook_events(store_id, processed);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to tables
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_settings_updated_at BEFORE UPDATE ON store_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_product_settings_updated_at BEFORE UPDATE ON product_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_tracking_updated_at BEFORE UPDATE ON inventory_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_billing_records_updated_at BEFORE UPDATE ON billing_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();