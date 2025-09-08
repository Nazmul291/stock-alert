# Database Schema Documentation

## Overview

The Stock Alert application uses PostgreSQL (via Supabase) as its primary database. The schema is designed for scalability, data integrity, and optimal query performance.

## Entity Relationship Diagram

```
┌─────────────────┐
│     STORES      │
│─────────────────│
│ id (PK)         │
│ shop_domain     │──────┐
│ access_token    │      │
│ plan            │      │
│ email           │      │
│ created_at      │      │
│ updated_at      │      │
└─────────────────┘      │
         │               │
         │ 1:N           │
         ▼               │
┌─────────────────┐      │
│ STORE_SETTINGS  │      │
│─────────────────│      │
│ id (PK)         │      │
│ store_id (FK)   │◄─────┤
│ auto_hide       │      │
│ auto_republish  │      │
│ threshold       │      │
│ email_enabled   │      │
│ slack_enabled   │      │
│ slack_webhook   │      │
│ created_at      │      │
│ updated_at      │      │
└─────────────────┘      │
                         │
         ┌───────────────┤
         │               │
         │ 1:N           │ 1:N
         ▼               ▼
┌─────────────────┐ ┌─────────────────┐
│INVENTORY_TRACK. │ │PRODUCT_SETTINGS │
│─────────────────│ │─────────────────│
│ id (PK)         │ │ id (PK)         │
│ store_id (FK)   │ │ store_id (FK)   │
│ product_id      │ │ product_id      │
│ variant_id      │ │ product_title   │
│ product_title   │ │ custom_threshold│
│ variant_title   │ │ exclude_hide    │
│ sku             │ │ exclude_alerts  │
│ current_qty     │ │ created_at      │
│ previous_qty    │ │ updated_at      │
│ last_checked    │ └─────────────────┘
│ last_alert      │
│ is_hidden       │
│ created_at      │
│ updated_at      │
└─────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────┐
│ ALERT_HISTORY   │
│─────────────────│
│ id (PK)         │
│ store_id (FK)   │
│ product_id      │
│ variant_id      │
│ alert_type      │
│ alert_channel   │
│ qty_at_alert    │
│ threshold       │
│ message         │
│ sent_at         │
│ created_at      │
└─────────────────┘
```

## Table Definitions

### 1. stores

Primary table for storing Shopify store information and authentication.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique store identifier |
| shop_domain | VARCHAR(255) | UNIQUE, NOT NULL | Shopify store domain |
| access_token | TEXT | NOT NULL | Shopify API access token |
| scope | VARCHAR(500) | | Granted API permissions |
| plan | VARCHAR(50) | DEFAULT 'free' | Subscription plan (free/pro) |
| email | VARCHAR(255) | | Primary contact email |
| created_at | TIMESTAMP | DEFAULT NOW() | Account creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last modification time |

**Indexes:**
- `idx_stores_shop_domain` on (shop_domain)

### 2. store_settings

Global configuration settings for each store.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique settings identifier |
| store_id | UUID | FOREIGN KEY, UNIQUE | Reference to stores table |
| auto_hide_enabled | BOOLEAN | DEFAULT true | Auto-hide when out of stock |
| auto_republish_enabled | BOOLEAN | DEFAULT false | Auto-show when restocked |
| low_stock_threshold | INTEGER | DEFAULT 5 | Global low stock threshold |
| email_notifications | BOOLEAN | DEFAULT true | Enable email alerts |
| slack_notifications | BOOLEAN | DEFAULT false | Enable Slack alerts (Pro) |
| slack_webhook_url | TEXT | | Slack webhook endpoint |
| notification_email | VARCHAR(255) | | Override notification email |
| created_at | TIMESTAMP | DEFAULT NOW() | Settings creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last modification time |

### 3. inventory_tracking

Real-time inventory levels for all tracked products.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique tracking identifier |
| store_id | UUID | FOREIGN KEY | Reference to stores table |
| product_id | BIGINT | NOT NULL | Shopify product ID |
| variant_id | BIGINT | NOT NULL | Shopify variant ID |
| product_title | VARCHAR(500) | | Product name |
| variant_title | VARCHAR(500) | | Variant name |
| sku | VARCHAR(255) | | Stock keeping unit |
| current_quantity | INTEGER | DEFAULT 0 | Current stock level |
| previous_quantity | INTEGER | | Previous stock level |
| last_checked_at | TIMESTAMP | DEFAULT NOW() | Last inventory check |
| last_alert_sent_at | TIMESTAMP | | Last alert timestamp |
| is_hidden | BOOLEAN | DEFAULT false | Product visibility status |
| created_at | TIMESTAMP | DEFAULT NOW() | First tracked time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

**Indexes:**
- `idx_inventory_tracking_store_product` on (store_id, product_id)
- `idx_inventory_tracking_quantity` on (current_quantity)
- **Unique Constraint:** (store_id, variant_id)

### 4. product_settings

Per-product configuration overrides.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique settings identifier |
| store_id | UUID | FOREIGN KEY | Reference to stores table |
| product_id | BIGINT | NOT NULL | Shopify product ID |
| product_title | VARCHAR(500) | | Product name (cached) |
| custom_threshold | INTEGER | | Override global threshold |
| exclude_from_auto_hide | BOOLEAN | DEFAULT false | Skip auto-hide rules |
| exclude_from_alerts | BOOLEAN | DEFAULT false | Skip alert notifications |
| created_at | TIMESTAMP | DEFAULT NOW() | Settings creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last modification time |

**Unique Constraint:** (store_id, product_id)

### 5. alert_history

Historical record of all sent alerts.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique alert identifier |
| store_id | UUID | FOREIGN KEY | Reference to stores table |
| product_id | BIGINT | NOT NULL | Shopify product ID |
| variant_id | BIGINT | | Shopify variant ID |
| alert_type | VARCHAR(50) | | Type: low_stock, out_of_stock, restocked |
| alert_channel | VARCHAR(50) | | Channel: email, slack |
| quantity_at_alert | INTEGER | | Stock level when alert sent |
| threshold_at_alert | INTEGER | | Threshold value at time |
| message | TEXT | | Alert message content |
| sent_at | TIMESTAMP | DEFAULT NOW() | Alert dispatch time |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |

**Indexes:**
- `idx_alert_history_store_sent` on (store_id, sent_at)

### 6. webhook_events

Webhook event log for debugging and replay.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique event identifier |
| store_id | UUID | FOREIGN KEY | Reference to stores table |
| topic | VARCHAR(255) | | Webhook topic/event type |
| payload | JSONB | | Raw webhook payload |
| processed | BOOLEAN | DEFAULT false | Processing status |
| error_message | TEXT | | Error details if failed |
| created_at | TIMESTAMP | DEFAULT NOW() | Event received time |
| processed_at | TIMESTAMP | | Processing completion time |

**Indexes:**
- `idx_webhook_events_store_processed` on (store_id, processed)

### 7. billing_records

Subscription and billing history.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique billing identifier |
| store_id | UUID | FOREIGN KEY | Reference to stores table |
| charge_id | BIGINT | UNIQUE | Shopify charge ID |
| plan | VARCHAR(50) | | Plan type: free, pro |
| status | VARCHAR(50) | | Status: pending, active, cancelled |
| amount | DECIMAL(10,2) | | Charge amount |
| currency | VARCHAR(10) | | Currency code |
| billing_on | DATE | | Next billing date |
| activated_on | TIMESTAMP | | Activation timestamp |
| cancelled_on | TIMESTAMP | | Cancellation timestamp |
| created_at | TIMESTAMP | DEFAULT NOW() | Record creation time |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update time |

### 8. setup_progress

Onboarding and setup tracking.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique progress identifier |
| store_id | UUID | FOREIGN KEY, UNIQUE | Reference to stores table |
| app_installed | BOOLEAN | DEFAULT true | Installation complete |
| global_settings_configured | BOOLEAN | DEFAULT false | Settings configured |
| notifications_configured | BOOLEAN | DEFAULT false | Alerts set up |
| product_thresholds_configured | BOOLEAN | DEFAULT false | Thresholds set |
| first_product_tracked | BOOLEAN | DEFAULT false | Has tracked products |
| created_at | TIMESTAMP | DEFAULT NOW() | Progress started |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last progress update |

### 9. auth_nonces

OAuth nonce storage for security.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| id | UUID | PRIMARY KEY | Unique nonce identifier |
| shop_domain | VARCHAR(255) | NOT NULL | Shop initiating OAuth |
| nonce | VARCHAR(255) | NOT NULL | Random nonce value |
| created_at | TIMESTAMP | DEFAULT NOW() | Nonce creation time |

## Database Triggers

### 1. Update Timestamp Trigger

Automatically updates the `updated_at` column on row modifications.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
CREATE TRIGGER update_stores_updated_at 
    BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2. Cleanup Old Nonces

Removes expired OAuth nonces older than 10 minutes.

```sql
CREATE OR REPLACE FUNCTION cleanup_old_nonces()
RETURNS void AS $$
BEGIN
    DELETE FROM auth_nonces 
    WHERE created_at < NOW() - INTERVAL '10 minutes';
END;
$$ LANGUAGE plpgsql;
```

## Row Level Security (RLS)

### Security Policies

Enable RLS on all tables to ensure data isolation:

```sql
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_tracking ENABLE ROW LEVEL SECURITY;
-- etc for all tables

-- Example policy: stores can only access their own data
CREATE POLICY "Stores can view own data" ON inventory_tracking
    FOR SELECT USING (store_id = current_setting('app.current_store_id')::uuid);
```

## Performance Optimizations

### Indexes Strategy

1. **Primary Keys**: All tables use UUID primary keys with B-tree indexes
2. **Foreign Keys**: Indexed for fast joins
3. **Query Patterns**: Indexed based on common WHERE clauses
4. **Composite Indexes**: For multi-column queries

### Partitioning Strategy

For high-volume tables (future consideration):
- **alert_history**: Partition by month
- **webhook_events**: Partition by week
- **inventory_tracking**: Partition by store_id range

### Vacuum Strategy

Regular maintenance tasks:
- Auto-vacuum enabled for all tables
- Weekly VACUUM ANALYZE for statistics
- Monthly REINDEX for optimal performance

## Migration Strategy

### Version Control

All schema changes tracked via migrations:
```
migrations/
├── 001_initial_schema.sql
├── 002_add_billing_tables.sql
├── 003_add_plan_limits.sql
└── 004_add_setup_progress.sql
```

### Rollback Plan

Each migration includes:
- UP migration (apply changes)
- DOWN migration (rollback changes)
- Data preservation strategy

## Backup & Recovery

### Backup Schedule
- **Full Backup**: Daily at 2 AM UTC
- **Incremental**: Every 6 hours
- **Transaction Logs**: Continuous archiving

### Retention Policy
- **Daily Backups**: 7 days
- **Weekly Backups**: 4 weeks
- **Monthly Backups**: 12 months

### Recovery Testing
- Monthly recovery drills
- RTO target: < 1 hour
- RPO target: < 1 hour

## Data Governance

### Data Classification
- **Sensitive**: access_tokens, webhook_urls
- **Private**: store data, settings
- **Internal**: system logs, metrics

### Compliance
- **GDPR**: Right to deletion implemented
- **Data Residency**: US-East region
- **Encryption**: AES-256 at rest

### Audit Trail
- All data modifications logged
- User actions tracked
- Retention: 90 days