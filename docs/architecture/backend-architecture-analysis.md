# Stock Alert App - Backend Architecture Analysis

## Executive Summary
This is a **Next.js 15 + Supabase + Shopify Admin API** serverless application with an embedded Shopify app architecture. The app uses **API routes** for backend logic and **Supabase PostgreSQL** for data persistence. Currently, there are NO scheduled background workers or cron jobs implemented.

---

## 1. Backend Structure Overview

### Core Stack
- **Framework**: Next.js 15 (App Router)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Shopify OAuth + Session Tokens
- **Email Notifications**: Nodemailer (SMTP via Zoho)
- **Slack Notifications**: @slack/webhook package
- **Deployment**: Docker + Heroku (standalone output)

### Directory Structure
```
/home/nazmul-hawlader/Desktop/App/App/shopify/stock-alert/
├── app/                          # Next.js App Router
│   ├── api/                      # API routes (backend)
│   │   ├── auth/                 # OAuth & Session handling
│   │   ├── webhooks/             # Shopify webhooks (inventory, uninstall, compliance)
│   │   ├── products/             # Product management endpoints
│   │   ├── billing/              # Billing & payments
│   │   ├── health/               # Health check endpoint
│   │   ├── setup-progress/       # Setup tracking
│   │   └── admin/                # Admin operations
│   ├── dashboard/                # Main UI
│   ├── products/                 # Product management UI
│   ├── settings/                 # Settings UI
│   ├── layout.tsx                # Root layout with providers
│   └── page.tsx                  # Home/dashboard page
├── lib/                          # Shared utilities & logic
│   ├── supabase.ts              # DB client & types
│   ├── shopify.ts               # Shopify API helpers
│   ├── notifications.ts         # Email/Slack sending
│   ├── email-templates.ts       # HTML email templates
│   ├── token-manager.ts         # Token management
│   ├── session-token.ts         # Session token verification
│   ├── session-token-edge.ts    # Edge runtime token verification
│   ├── plan-enforcement.ts      # Plan-based feature limits
│   └── request-queue.ts         # Request queuing
├── middleware.ts                 # Next.js middleware for auth
├── components/                   # React components (UI)
├── supabase/                     # Database migrations & schema
│   └── schema.sql               # PostgreSQL schema definition
└── hooks/                        # Custom React hooks
```

---

## 2. Database Setup (Supabase PostgreSQL)

### Connection Details
```typescript
// lib/supabase.ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
```

### Database Clients
1. **`supabase`** - Anonymous client (for client-side requests)
2. **`supabaseAdmin`** - Service role client (for server-side operations with elevated privileges)

### Main Tables
```sql
1. stores
   - id (UUID PK)
   - shop_domain (UNIQUE)
   - access_token (Shopify API token)
   - scope (OAuth scopes granted)
   - plan (free/pro)
   - email
   - created_at, updated_at

2. store_settings
   - id (UUID PK)
   - store_id (FK to stores)
   - auto_hide_enabled (BOOLEAN)
   - auto_republish_enabled (BOOLEAN)
   - low_stock_threshold (INTEGER)
   - email_notifications (BOOLEAN)
   - slack_notifications (BOOLEAN)
   - slack_webhook_url (TEXT)
   - notification_email (VARCHAR)
   - created_at, updated_at

3. inventory_tracking
   - id (UUID PK)
   - store_id (FK)
   - product_id (BIGINT)
   - variant_id (BIGINT) [variant-level tracking]
   - product_title, variant_title, sku
   - current_quantity, previous_quantity
   - last_checked_at
   - last_alert_sent_at
   - is_hidden (BOOLEAN)
   - inventory_status (enum: active/deactivated)
   - created_at, updated_at

4. product_settings
   - id (UUID PK)
   - store_id (FK)
   - product_id (BIGINT)
   - custom_threshold (per-product override)
   - exclude_from_auto_hide (BOOLEAN)
   - exclude_from_alerts (BOOLEAN)
   - created_at, updated_at

5. alert_history
   - id (UUID PK)
   - store_id (FK)
   - product_id (BIGINT)
   - variant_id (BIGINT)
   - alert_type (low_stock/out_of_stock/restocked)
   - alert_channel (email/slack)
   - quantity_at_alert, threshold_at_alert
   - message, sent_at
   - created_at

6. setup_progress
   - id (UUID PK)
   - store_id (FK)
   - Tracks: app_installed, global_settings_configured, 
     notifications_configured, product_thresholds_configured, 
     first_product_tracked
   - created_at, updated_at

7. billing_records
   - Billing/payment tracking

8. gdpr_requests
   - GDPR data deletion requests

9. inventory_item_mapping
   - Maps Shopify inventory_item_id → products for O(1) webhook lookups
```

### Performance Indexes
- `idx_stores_shop_domain` - Fast OAuth lookups
- `idx_stores_plan` - Plan-based filtering
- `idx_inventory_tracking_store_id` - All inventory for a store
- `idx_inventory_tracking_store_product` - Product-specific queries
- `idx_inventory_tracking_store_quantity` - Low stock queries
- Composite indexes on (store_id, product_id) for UNIQUE constraints

---

## 3. API Route Structure

### Authentication Routes (`/api/auth`)
```
GET/POST /api/auth/
  - OAuth initiation, redirects to Shopify

GET/POST /api/auth/callback
  - OAuth callback handler, creates/updates store in DB

GET/POST /api/auth/token-exchange
  - Exchanges code for access_token

GET /api/auth/session
  - Session token verification

GET /api/auth/verify
  - Verify current auth status
```

### Webhook Routes (`/api/webhooks`)
```
POST /api/webhooks/inventory
  - Processes inventory_levels/update webhooks
  - Triggers low stock/out-of-stock alerts
  - Auto-hides/republishes products based on settings
  - Uses in-memory cache (3s TTL) for duplicate prevention
  - Includes setInterval cleanup (10s)

POST /api/webhooks/uninstall
  - Handles app uninstall, triggers GDPR cleanup

POST /api/webhooks/register
  - Registers webhooks with Shopify

GET /api/webhooks/list
  - Lists registered webhooks

POST /api/webhooks/compliance
  - Handles Shopify compliance requests
```

### Products Routes (`/api/products`)
```
GET /api/products/list
  - Fetches Shopify products, returns paginated list

POST /api/products/sync
  - Syncs products to inventory_tracking table

POST /api/products/validate
  - Validates product settings

POST /api/products/reset
  - Resets product tracking data

GET /api/products/stats
  - Returns inventory statistics
```

### Billing Routes (`/api/billing`)
```
POST /api/billing/
  - Creates billing session

GET/POST /api/billing/callback
  - Processes billing callbacks
```

### Other Routes
```
GET /api/health
  - Simple health check (returns JSON status)

GET /api/setup-progress
  - Gets setup wizard progress

GET /api/shopify/graphql
  - GraphQL proxy to Shopify Admin API

GET /api/shopify/verify-session
  - Verifies session token

POST /api/admin/enforce-plan-limits
  - Enforces plan-based restrictions
```

### Request Flow Pattern
```
Middleware (middleware.ts)
  ↓
Route Handler (API route)
  ↓
Shopify API or Database Query
  ↓
Response/Data Processing
  ↓
Return JSON Response
```

---

## 4. Existing Background Tasks & Workers

### Current Implementation
```
In-Memory Cache Cleanup (Webhook Duplicate Prevention)
Location: /api/webhooks/inventory/route.ts
┌─────────────────────────────────────┐
│ setInterval(cleanupCache, 10000)    │
│ - Runs every 10 seconds             │
│ - Clears expired cache entries      │
│ - 3-second TTL for duplicate check  │
└─────────────────────────────────────┘
```

### No Scheduled Tasks Found
- **No cron jobs** (no node-cron, bull, agenda packages)
- **No polling mechanisms**
- **No background workers** (no bullmq, workers, background processing)
- **No scheduled functions** for:
  - Inventory sync
  - Stale data cleanup
  - Health checks
  - Token refresh
  - Billing updates

---

## 5. Entry Points & Initialization

### Server-Side Initialization (Next.js App Router)
```typescript
// app/layout.tsx - Root layout
├── Metadata setup
├── Provider initialization:
│   ├── ReduxProvider (Redux store)
│   ├── PolarisProvider (Shopify UI kit)
│   ├── ShopifyProvider (custom Shopify context)
│   └── AppBridgeInit (Shopify App Bridge)
└── Child components render

// app/page.tsx - Home/Dashboard
├── Server Component (async)
├── OAuth check (redirects if needed)
├── Parallel data fetching:
│   ├── getInventoryStats()
│   ├── getSetupProgress()
│   ├── getStoreSettings()
│   └── getRecentAlerts()
└── Returns DashboardClient
```

### Middleware Execution
```typescript
// middleware.ts - Edge runtime
├── Public paths check
├── API route authentication
├── Session token verification
├── Protected routes enforcement
└── Pass through or 401 response
```

### Shopify OAuth Flow
```
1. GET /api/auth → Redirect to Shopify
2. User grants permissions
3. Shopify → GET /api/auth/callback?code=...&shop=...
4. Exchange code for access token
5. Create/update store in Supabase
6. Redirect to dashboard
```

### First Request After Install
1. App loads in Shopify Admin (embedded)
2. Layout.tsx initializes providers
3. page.tsx checks OAuth status
4. If authenticated: fetches dashboard data in parallel
5. getSetupProgress() creates new record if needed
6. Dashboard renders

---

## 6. Recommended Architecture for Heartbeat (6-Hour Function)

### Best Implementation Approach: API Route + External Scheduler

Since this is a **serverless Next.js app**, implementing a true background worker is challenging. Here are the recommended options:

### Option A: External Scheduler (RECOMMENDED)
**Best for: Production reliability**

```
External Service (e.g., AWS EventBridge, CloudScheduler, Vercel Cron)
  ↓ (every 6 hours)
POST /api/internal/heartbeat
  ↓
Supabase Update
  ↓
Optional: Send Slack/Email notification
```

**Why This Works**:
- Runs independently of app instance
- Reliable even if app goes down
- Easy to monitor/trigger manually
- Can handle multiple stores in one execution
- Works with Heroku (scheduler dyno addon)

### Option B: Custom Cron Service (Alternative)
Deploy a lightweight Node.js service that:
- Runs on schedule
- Makes HTTP requests to your app
- Stored separately from main app

### Option C: In-Process Interval (Least Recommended)
```typescript
// Runs only while app instance is alive
setInterval(async () => {
  // heartbeat logic
}, 6 * 60 * 60 * 1000) // 6 hours
```

**Problems**:
- Dies when app restarts
- Different instances maintain separate timers
- Cold starts reset the interval
- Unreliable for serverless deployments

---

## 7. Recommended Location for Heartbeat Implementation

### File Structure
```
app/api/internal/heartbeat/route.ts
  ├── Purpose: 6-hour heartbeat execution
  ├── Access: Only via external scheduler (secret key)
  ├── Actions:
  │   ├── Update heartbeat_logs table
  │   ├── Check store statuses
  │   ├── Monitor webhook connectivity
  │   └── Trigger maintenance if needed
  └── Response: JSON status

lib/heartbeat.ts (utility functions)
  ├── updateHeartbeatLog()
  ├── checkStoreHealth()
  ├── verifyWebhooks()
  └── triggerCleanup()

supabase/migrations/add_heartbeat_table.sql
  └── Create heartbeat_logs table
      ├── id (UUID PK)
      ├── executed_at
      ├── stores_checked (INTEGER)
      ├── issues_found (INTEGER)
      └── status (success/failed)
```

### Database Enhancement (New Table)
```sql
CREATE TABLE heartbeat_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  stores_checked INTEGER,
  issues_found INTEGER,
  webhook_status TEXT,
  cleanup_performed BOOLEAN,
  status VARCHAR(50), -- success, warning, error
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX idx_heartbeat_logs_executed_at 
ON heartbeat_logs(executed_at DESC);
```

### Implementation in Middleware/Config
```typescript
// middleware.ts - Add to public paths
if (request.nextUrl.pathname === '/api/internal/heartbeat') {
  // Verify secret key in header
  const secret = request.headers.get('x-heartbeat-secret');
  if (secret !== process.env.HEARTBEAT_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}
```

### Suggested Heartbeat Actions
1. **Log execution** → Record in heartbeat_logs
2. **Check store count** → Alert if stores declining
3. **Verify webhooks** → Check if registered correctly
4. **Cleanup stale data** → Delete old alert_history records (>90 days)
5. **Token rotation** → Refresh any expiring tokens
6. **Send status report** → Email/Slack notification to admin
7. **Health metrics** → Database connection, API availability

---

## 8. Key Architectural Patterns

### Request Validation
```typescript
// middleware.ts handles:
- Session token verification
- Public path whitelisting
- Protected route enforcement
```

### Error Handling
```typescript
// Server components use try/catch
async function getInventoryStats(storeId: string) {
  try {
    // DB queries
    return data;
  } catch (error) {
    // Fallback data
    return { totalProducts: 0, ... };
  }
}
```

### Data Fetching
```typescript
// Server components use parallel queries
const [a, b, c] = await Promise.all([
  query1(),
  query2(),
  query3()
]);
```

### Notification Flow
```
Webhook Event
  ↓
Verify HMAC signature
  ↓
Check duplicate cache
  ↓
Query database for settings
  ↓
Generate email/Slack message
  ↓
Send via Nodemailer/Slack API
  ↓
Log in alert_history table
```

---

## 9. Environment Configuration

### Critical .env Variables
```
# Shopify
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_SCOPES (read_products,write_products,read_inventory,write_inventory)
SHOPIFY_APP_URL
SHOPIFY_WEBHOOK_URL

# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Email (Nodemailer)
EMAIL_HOST (smtp.zoho.com)
EMAIL_PORT (587)
EMAIL_USER
EMAIL_PASS

# Webhooks & Security
JWT_SECRET
HEARTBEAT_SECRET (new - for scheduler auth)

# App
NODE_ENV
NEXT_PUBLIC_HOST
```

---

## 10. Deployment Architecture

### Current Setup
- **Server**: Heroku (Docker container)
- **Build Output**: `output: 'standalone'` in next.config.ts
- **Database**: Supabase Cloud (managed)
- **Email**: Zoho SMTP
- **Webhooks**: Shopify → App → Database

### Potential Improvements for Heartbeat
1. Use **Heroku Scheduler** (add-on) for reliable 6-hour intervals
2. Or use **AWS EventBridge** for cost-effective scheduling
3. Or use **Vercel Cron Jobs** if migrating to Vercel

---

## Summary & Recommendations

### Current State
- Lightweight serverless architecture
- Database-driven event processing (webhooks)
- No background job queue
- Simple API route handlers
- Minimal in-memory state management

### For Implementing 6-Hour Heartbeat

**RECOMMENDED APPROACH:**
```
1. Create /api/internal/heartbeat/route.ts
2. Add heartbeat_logs table to Supabase
3. Use Heroku Scheduler (free/$50/month) or external cron service
4. Protect endpoint with secret key in header
5. Log execution status in database
6. Optional: Send Slack/Email notifications
```

**File Locations to Create/Modify:**
```
NEW:
  - app/api/internal/heartbeat/route.ts
  - lib/heartbeat.ts
  - supabase/migrations/add_heartbeat_table.sql

MODIFY:
  - middleware.ts (add heartbeat to public paths)
  - .env.local (add HEARTBEAT_SECRET)
  - docs/ (add heartbeat documentation)
```

**Key Advantages:**
- Decoupled from app lifecycle
- Reliable scheduling
- Audit trail in database
- Easy to test/trigger manually
- Scalable for multiple stores
- Follows Shopify best practices
