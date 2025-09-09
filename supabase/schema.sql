-- =============================================
-- STOCK ALERT APP - COMPLETE DATABASE SCHEMA
-- =============================================
-- Description: Production-ready database schema for Shopify Stock Alert app
-- Version: 1.0.0
-- Date: 2024
-- 
-- This is the ONLY schema file needed for the application.
-- It includes all tables, indexes, functions, and optimizations.
-- =============================================

-- Drop existing tables if needed (BE CAREFUL IN PRODUCTION!)
-- Uncomment only if you want to completely reset the database
-- DROP SCHEMA public CASCADE;
-- CREATE SCHEMA public;

-- =============================================
-- 1. STORES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS stores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    shop_domain VARCHAR(255) UNIQUE NOT NULL,
    access_token TEXT NOT NULL,
    scope TEXT, -- Changed from VARCHAR(500) to TEXT for consistency
    email VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_stores_shop_domain ON stores(shop_domain);
CREATE INDEX IF NOT EXISTS idx_stores_plan ON stores(plan);

-- =============================================
-- 2. STORE SETTINGS TABLE (CORRECTED)
-- =============================================
-- Fixed column names to match application code expectations
CREATE TABLE IF NOT EXISTS store_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    
    -- Corrected column names to match app code
    low_stock_threshold INTEGER DEFAULT 5, -- was global_low_stock_threshold
    auto_hide_enabled BOOLEAN DEFAULT false, -- was auto_hide_out_of_stock
    email_notifications BOOLEAN DEFAULT true, -- was enable_email_alerts
    slack_notifications BOOLEAN DEFAULT false, -- was enable_slack_alerts
    
    -- Additional columns from app usage
    notification_email VARCHAR(255),
    slack_webhook_url TEXT,
    auto_republish_enabled BOOLEAN DEFAULT false, -- For auto-republishing products
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS idx_store_settings_store_id ON store_settings(store_id);

-- =============================================
-- 3. PRODUCT SETTINGS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS product_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    custom_threshold INTEGER,
    exclude_from_auto_hide BOOLEAN DEFAULT false,
    exclude_from_alerts BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_settings_store_product ON product_settings(store_id, product_id);

-- =============================================
-- 4. INVENTORY TRACKING TABLE (Product-level)
-- =============================================
CREATE TABLE IF NOT EXISTS inventory_tracking (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL,
    product_title VARCHAR(500),
    variant_title VARCHAR(500), -- Kept for potential future use
    sku VARCHAR(255),
    current_quantity INTEGER DEFAULT 0,
    previous_quantity INTEGER,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    last_alert_sent_at TIMESTAMP WITH TIME ZONE,
    is_hidden BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id, product_id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_inventory_tracking_store_id ON inventory_tracking(store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tracking_store_product ON inventory_tracking(store_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tracking_store_quantity ON inventory_tracking(store_id, current_quantity);
CREATE INDEX IF NOT EXISTS idx_inventory_tracking_store_hidden ON inventory_tracking(store_id, is_hidden);
CREATE INDEX IF NOT EXISTS idx_inventory_tracking_last_checked ON inventory_tracking(last_checked_at);
CREATE INDEX IF NOT EXISTS idx_inventory_tracking_last_alert ON inventory_tracking(store_id, last_alert_sent_at);

-- =============================================
-- 5. ALERT HISTORY TABLE (CORRECTED)
-- =============================================
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id BIGINT,
    product_title VARCHAR(500),
    
    -- Corrected to match app usage
    alert_type VARCHAR(50), -- 'low_stock', 'out_of_stock', 'restock'
    quantity_at_alert INTEGER,
    threshold_triggered INTEGER, -- was threshold_at_alert
    
    -- Notification details
    sent_to_email VARCHAR(255),
    sent_to_slack BOOLEAN DEFAULT false,
    
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_alert_history_store_id ON alert_history(store_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_sent_at ON alert_history(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_store_recent ON alert_history(store_id, sent_at DESC);

-- =============================================
-- 6. SETUP PROGRESS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS setup_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    app_installed BOOLEAN DEFAULT true,
    global_settings_configured BOOLEAN DEFAULT false,
    notifications_configured BOOLEAN DEFAULT false,
    product_thresholds_configured BOOLEAN DEFAULT false,
    first_product_tracked BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS idx_setup_progress_store_id ON setup_progress(store_id);

-- =============================================
-- 7. WEBHOOKS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    webhook_id BIGINT NOT NULL,
    topic VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(store_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_webhooks_store_id ON webhooks(store_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_topic ON webhooks(topic);

-- =============================================
-- 8. AUTH NONCES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS auth_nonces (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nonce VARCHAR(255) UNIQUE NOT NULL,
    shop VARCHAR(255) NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) + INTERVAL '10 minutes'
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_nonce ON auth_nonces(nonce);
CREATE INDEX IF NOT EXISTS idx_auth_nonces_expires ON auth_nonces(expires_at);

-- =============================================
-- 9. WEBHOOK EVENTS TABLE
-- =============================================
-- Stores webhook events for processing and debugging
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    topic VARCHAR(100) NOT NULL,
    payload JSONB,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_store_processed ON webhook_events(store_id, processed);
CREATE INDEX IF NOT EXISTS idx_webhook_events_topic ON webhook_events(topic);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC);

-- =============================================
-- 10. INVENTORY ITEM MAPPING TABLE (Performance)
-- =============================================
CREATE TABLE IF NOT EXISTS inventory_item_mapping (
    inventory_item_id BIGINT PRIMARY KEY,
    product_id BIGINT NOT NULL,
    variant_id BIGINT,
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_inventory_item_mapping_store ON inventory_item_mapping(store_id, inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item_mapping_product ON inventory_item_mapping(store_id, product_id);

-- =============================================
-- 10. DATA VALIDATION CONSTRAINTS
-- =============================================
-- Add CHECK constraints for data validation
-- Using DO blocks to make constraints idempotent
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_positive_quantity') THEN
        ALTER TABLE inventory_tracking ADD CONSTRAINT chk_positive_quantity 
            CHECK (current_quantity >= 0);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_positive_previous') THEN
        ALTER TABLE inventory_tracking ADD CONSTRAINT chk_positive_previous 
            CHECK (previous_quantity IS NULL OR previous_quantity >= 0);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_valid_alert_type') THEN
        ALTER TABLE alert_history ADD CONSTRAINT chk_valid_alert_type 
            CHECK (alert_type IN ('low_stock', 'out_of_stock', 'restock'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_valid_plan') THEN
        ALTER TABLE stores ADD CONSTRAINT chk_valid_plan 
            CHECK (plan IN ('free', 'pro', 'enterprise'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_positive_threshold') THEN
        ALTER TABLE product_settings ADD CONSTRAINT chk_positive_threshold 
            CHECK (custom_threshold IS NULL OR custom_threshold > 0);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_positive_low_stock') THEN
        ALTER TABLE store_settings ADD CONSTRAINT chk_positive_low_stock 
            CHECK (low_stock_threshold > 0);
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;  -- Ignore if constraints already exist
END $$;

-- =============================================
-- 11. UPDATE TRIGGERS
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables with updated_at
DROP TRIGGER IF EXISTS update_stores_updated_at ON stores;
CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_store_settings_updated_at ON store_settings;
CREATE TRIGGER update_store_settings_updated_at BEFORE UPDATE ON store_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_product_settings_updated_at ON product_settings;
CREATE TRIGGER update_product_settings_updated_at BEFORE UPDATE ON product_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_tracking_updated_at ON inventory_tracking;
CREATE TRIGGER update_inventory_tracking_updated_at BEFORE UPDATE ON inventory_tracking
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_setup_progress_updated_at ON setup_progress;
CREATE TRIGGER update_setup_progress_updated_at BEFORE UPDATE ON setup_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhooks_updated_at ON webhooks;
CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON webhooks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventory_item_mapping_updated_at ON inventory_item_mapping;
CREATE TRIGGER update_inventory_item_mapping_updated_at BEFORE UPDATE ON inventory_item_mapping
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_webhook_events_updated_at ON webhook_events;
CREATE TRIGGER update_webhook_events_updated_at BEFORE UPDATE ON webhook_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 11. OPTIMIZED FUNCTIONS
-- =============================================

-- Dashboard stats function (combines 6 queries into 1)
CREATE OR REPLACE FUNCTION get_inventory_stats(p_store_id UUID)
RETURNS TABLE (
    total_products BIGINT,
    low_stock BIGINT,
    out_of_stock BIGINT,
    hidden BIGINT,
    alerts_today BIGINT
) 
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) FILTER (WHERE 1=1) AS total_products,
        COUNT(*) FILTER (WHERE current_quantity > 0 AND current_quantity < 5) AS low_stock,
        COUNT(*) FILTER (WHERE current_quantity = 0) AS out_of_stock,
        COUNT(*) FILTER (WHERE is_hidden = true) AS hidden,
        (SELECT COUNT(*) 
         FROM alert_history 
         WHERE store_id = p_store_id 
         AND sent_at >= CURRENT_DATE) AS alerts_today
    FROM inventory_tracking
    WHERE store_id = p_store_id;
END;
$$;

-- Bulk upsert function for inventory
CREATE OR REPLACE FUNCTION bulk_upsert_inventory(
    p_store_id UUID,
    p_inventory_data JSONB
)
RETURNS TABLE (
    inserted_count INTEGER,
    updated_count INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_inserted_count INTEGER := 0;
    v_updated_count INTEGER := 0;
    v_item JSONB;
BEGIN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_inventory_data)
    LOOP
        UPDATE inventory_tracking
        SET 
            product_title = v_item->>'product_title',
            sku = v_item->>'sku',
            current_quantity = (v_item->>'current_quantity')::INTEGER,
            previous_quantity = current_quantity,
            last_checked_at = NOW(),
            updated_at = NOW()
        WHERE 
            store_id = p_store_id 
            AND product_id = (v_item->>'product_id')::BIGINT;
        
        IF FOUND THEN
            v_updated_count := v_updated_count + 1;
        ELSE
            INSERT INTO inventory_tracking (
                store_id,
                product_id,
                product_title,
                sku,
                current_quantity,
                previous_quantity,
                is_hidden,
                last_checked_at
            ) VALUES (
                p_store_id,
                (v_item->>'product_id')::BIGINT,
                v_item->>'product_title',
                v_item->>'sku',
                (v_item->>'current_quantity')::INTEGER,
                (v_item->>'current_quantity')::INTEGER,
                false,
                NOW()
            );
            v_inserted_count := v_inserted_count + 1;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT v_inserted_count, v_updated_count;
END;
$$;

-- Cleanup function for old alerts
CREATE OR REPLACE FUNCTION cleanup_old_alerts(p_days_to_keep INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM alert_history
    WHERE sent_at < CURRENT_DATE - INTERVAL '1 day' * p_days_to_keep;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$;

-- Cleanup expired auth nonces
CREATE OR REPLACE FUNCTION cleanup_expired_nonces()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM auth_nonces
    WHERE expires_at < NOW() OR used = true;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    
    RETURN v_deleted_count;
END;
$$;

-- =============================================
-- 12. ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE setup_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_item_mapping ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 13. MIGRATION HELPERS
-- =============================================
-- If migrating from old schema, use these to fix column names

DO $$ 
BEGIN
    -- Fix store_settings column names if they exist with old names
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'store_settings' 
               AND column_name = 'global_low_stock_threshold') THEN
        ALTER TABLE store_settings RENAME COLUMN global_low_stock_threshold TO low_stock_threshold;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'store_settings' 
               AND column_name = 'auto_hide_out_of_stock') THEN
        ALTER TABLE store_settings RENAME COLUMN auto_hide_out_of_stock TO auto_hide_enabled;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'store_settings' 
               AND column_name = 'enable_email_alerts') THEN
        ALTER TABLE store_settings RENAME COLUMN enable_email_alerts TO email_notifications;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'store_settings' 
               AND column_name = 'enable_slack_alerts') THEN
        ALTER TABLE store_settings RENAME COLUMN enable_slack_alerts TO slack_notifications;
    END IF;
END $$;

-- =============================================
-- 14. COMMENTS FOR DOCUMENTATION
-- =============================================
COMMENT ON TABLE stores IS 'Authenticated Shopify stores with OAuth tokens';
COMMENT ON TABLE store_settings IS 'Global configuration settings per store';
COMMENT ON TABLE product_settings IS 'Product-specific override settings';
COMMENT ON TABLE inventory_tracking IS 'Real-time inventory levels tracked at product level';
COMMENT ON TABLE alert_history IS 'Log of all notifications sent';
COMMENT ON TABLE setup_progress IS 'Onboarding progress tracking';
COMMENT ON TABLE webhooks IS 'Registered Shopify webhooks per store';
COMMENT ON TABLE auth_nonces IS 'OAuth security nonces for CSRF protection';
COMMENT ON TABLE webhook_events IS 'Webhook event queue for processing and debugging';
COMMENT ON TABLE inventory_item_mapping IS 'Maps Shopify inventory_item_id to products for O(1) webhook lookups';

COMMENT ON FUNCTION get_inventory_stats(UUID) IS 'Returns dashboard statistics in single optimized query';
COMMENT ON FUNCTION bulk_upsert_inventory(UUID, JSONB) IS 'Efficiently handles bulk inventory updates';
COMMENT ON FUNCTION cleanup_old_alerts(INTEGER) IS 'Removes alerts older than specified days';
COMMENT ON FUNCTION cleanup_expired_nonces() IS 'Removes expired OAuth nonces';

-- =============================================
-- END OF COMPLETE UNIFIED SCHEMA
-- =============================================