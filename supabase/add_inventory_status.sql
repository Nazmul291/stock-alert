-- Migration: Add inventory_status field to inventory_tracking table
-- This implements status-based alerts instead of cooldown-based alerts

-- Add inventory_status field if it doesn't exist
ALTER TABLE inventory_tracking ADD COLUMN IF NOT EXISTS inventory_status VARCHAR(20) DEFAULT 'in_stock';

-- Add constraint for valid status values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_valid_inventory_status') THEN
        ALTER TABLE inventory_tracking ADD CONSTRAINT chk_valid_inventory_status
            CHECK (inventory_status IN ('in_stock', 'low_stock', 'out_of_stock', 'deactivated'));
    END IF;
END $$;

-- Create index for efficient status queries
CREATE INDEX IF NOT EXISTS idx_inventory_tracking_status ON inventory_tracking(store_id, inventory_status);

-- Initialize existing records with appropriate status based on current_quantity
-- This uses a more sophisticated approach that considers store settings
DO $$
DECLARE
    rec RECORD;
    threshold INTEGER;
BEGIN
    FOR rec IN
        SELECT it.id, it.current_quantity, it.store_id, COALESCE(ss.low_stock_threshold, 5) as threshold
        FROM inventory_tracking it
        LEFT JOIN store_settings ss ON it.store_id = ss.store_id
        WHERE it.inventory_status IS NULL OR it.inventory_status = 'in_stock'
    LOOP
        UPDATE inventory_tracking
        SET inventory_status = CASE
            WHEN rec.current_quantity = 0 THEN 'out_of_stock'
            WHEN rec.current_quantity <= rec.threshold THEN 'low_stock'
            ELSE 'in_stock'
        END
        WHERE id = rec.id;
    END LOOP;
END $$;

-- Remove the last_alert_sent_at field since we're using status-based alerts now
-- (Keep it for now for backwards compatibility, but it won't be used)
COMMENT ON COLUMN inventory_tracking.last_alert_sent_at IS 'DEPRECATED: Use inventory_status for alert logic instead';

-- Add comment to document the new field
COMMENT ON COLUMN inventory_tracking.inventory_status IS 'Current inventory status: in_stock, low_stock, out_of_stock, deactivated. Alerts only sent when status changes. Deactivated products are skipped during processing (for plan limits).';