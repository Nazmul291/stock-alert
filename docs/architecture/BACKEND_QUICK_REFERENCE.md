# Backend Architecture - Quick Reference

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    STOCK ALERT APP STACK                   │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Shopify Admin                                                │
│ - OAuth authentication                                       │
│ - Webhook events (inventory_levels/update)                   │
│ - GraphQL Admin API queries                                  │
└──────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Next.js 15 App Router (Deployed on Heroku)                  │
├──────────────────────────────────────────────────────────────┤
│ Frontend (React Components):                                  │
│  - app/layout.tsx (root with providers)                      │
│  - app/page.tsx (dashboard/home)                             │
│  - app/dashboard/ (main UI)                                  │
│  - app/products/ (product management)                        │
│  - app/settings/ (settings UI)                               │
│                                                               │
│ Backend (API Routes):                                         │
│  - app/api/auth/ (OAuth & sessions)                          │
│  - app/api/webhooks/ (webhook handlers)                      │
│  - app/api/products/ (product endpoints)                     │
│  - app/api/billing/ (payment endpoints)                      │
│  - app/api/internal/heartbeat/ (6-hour check)               │
│                                                               │
│ Utilities:                                                    │
│  - lib/supabase.ts (DB client & types)                       │
│  - lib/notifications.ts (email & Slack)                      │
│  - lib/shopify.ts (API helpers)                              │
│  - lib/heartbeat.ts (health checks)                          │
│                                                               │
│ Middleware:                                                   │
│  - middleware.ts (auth & session verification)               │
└──────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        ▼                   ▼                   ▼
┌──────────────┐    ┌──────────────┐   ┌──────────────┐
│  Supabase    │    │  Shopify API │   │ Email/Slack  │
│  PostgreSQL  │    │  (Admin API)  │   │ Notifications│
├──────────────┤    └──────────────┘   └──────────────┘
│ - stores     │
│ - inventory  │
│ - alerts     │
│ - settings   │
│ - logs       │
└──────────────┘
```

---

## Database Tables (Supabase PostgreSQL)

### Core Tables

| Table | Purpose | Key Fields | Relationships |
|-------|---------|-----------|---------------|
| `stores` | Shop authentication & plan | id, shop_domain, access_token, plan | PK for all others |
| `store_settings` | Feature toggles & thresholds | store_id, auto_hide_enabled, threshold | FK → stores |
| `inventory_tracking` | Product quantities & status | store_id, product_id, current_qty, is_hidden | FK → stores |
| `product_settings` | Per-product overrides | store_id, product_id, custom_threshold | FK → stores |
| `alert_history` | All alerts sent (audit trail) | store_id, alert_type, alert_channel, sent_at | FK → stores |
| `setup_progress` | Onboarding tracking | store_id, flags for completion | FK → stores |

### Supporting Tables

| Table | Purpose |
|-------|---------|
| `heartbeat_logs` | 6-hour health check logs |
| `billing_records` | Payment & billing tracking |
| `gdpr_requests` | Data deletion requests |
| `inventory_item_mapping` | Shopify inventory_item_id → product mapping |

---

## API Route Structure

### Authentication Routes
```
POST /api/auth/                    # OAuth initiation
POST /api/auth/callback            # OAuth callback
POST /api/auth/token-exchange      # Code → access token
GET  /api/auth/session             # Session token verify
GET  /api/auth/verify              # Check auth status
```

### Webhook Routes
```
POST /api/webhooks/inventory       # Main webhook handler (inventory_levels/update)
POST /api/webhooks/uninstall       # App uninstall handler
POST /api/webhooks/register        # Register webhooks with Shopify
GET  /api/webhooks/list            # List registered webhooks
POST /api/webhooks/compliance      # Shopify compliance requests
```

### Product Routes
```
GET  /api/products/list            # Fetch products from Shopify
POST /api/products/sync            # Sync to inventory_tracking
POST /api/products/validate        # Validate settings
POST /api/products/reset           # Reset tracking data
GET  /api/products/stats           # Inventory statistics
```

### Billing Routes
```
POST /api/billing/                 # Create billing session
GET  /api/billing/callback         # Billing callback
POST /api/billing/callback         # Process callback
```

### Utility Routes
```
GET  /api/health                   # Health check
GET  /api/setup-progress           # Setup wizard status
POST /api/internal/heartbeat       # 6-hour health check (RECOMMENDED)
```

### Request Flow Pattern
```
Client Request
    ↓
middleware.ts (verify session token / allow public paths)
    ↓
Route Handler (app/api/.../route.ts)
    ↓
Business Logic (lib/*.ts)
    ↓
Supabase Query / Shopify API Call
    ↓
Response (JSON)
    ↓
Client
```

---

## Key Initialization Entry Points

### 1. Root Layout (app/layout.tsx)
```typescript
- Loads App Bridge script from Shopify CDN
- Initializes Providers:
  - ReduxProvider (state management)
  - PolarisProvider (Shopify UI)
  - ShopifyProvider (custom context)
  - AppBridgeInit (App Bridge initialization)
```

### 2. Home Page (app/page.tsx)
```typescript
- Server Component (async)
- Checks OAuth status
- Fetches dashboard data in parallel:
  - getInventoryStats()
  - getSetupProgress()
  - getStoreSettings()
  - getRecentAlerts()
- Renders DashboardClient or landing page
```

### 3. Middleware (middleware.ts)
```typescript
- Runs on every request (Edge Runtime)
- Verifies session tokens
- Protects API routes
- Allows public paths (webhooks, auth)
- Returns 401 for unauthorized protected routes
```

### 4. Webhook Handler (app/api/webhooks/inventory/route.ts)
```typescript
- Triggered by Shopify inventory_levels/update webhook
- Verifies HMAC signature
- Checks duplicate cache (3s TTL)
- Processes inventory changes
- Sends email/Slack alerts
- Updates database
```

---

## Background Tasks

### Currently Implemented
```
setInterval(cleanupCache, 10000)
├─ Location: app/api/webhooks/inventory/route.ts
├─ Interval: Every 10 seconds
├─ Purpose: Clear expired webhook duplicate cache (3s TTL)
└─ Status: Always running (within webhook handler)
```

### Not Yet Implemented
- No periodic inventory sync
- No stale data cleanup
- No token refresh scheduling
- No health monitoring (except webhooks)

### Recommended: 6-Hour Heartbeat
```
External Scheduler (Heroku/AWS/GCP)
    ↓ (every 6 hours)
POST /api/internal/heartbeat
    ├─ Verify secret key
    ├─ Check store health
    ├─ Verify webhooks
    ├─ Cleanup old alerts
    ├─ Log to heartbeat_logs
    └─ Send notifications
```

---

## Database Connection

### Supabase Clients
```typescript
// lib/supabase.ts

// Anonymous client (client-side)
const supabase = createClient(url, anonKey);

// Service role client (server-side)
const supabaseAdmin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
```

### Usage Pattern
```typescript
// Server-side (API routes, Server Components)
const { data, error } = await supabaseAdmin
  .from('table_name')
  .select('*')
  .eq('store_id', storeId);

// Error handling
if (error) {
  console.error('Query failed:', error);
  return fallbackData;
}
```

---

## Notification System

### Email Notifications
```
Nodemailer Setup:
├─ Host: smtp.zoho.com
├─ Port: 587
├─ User: info@nazmulcodes.org
└─ Password: (from .env)

Triggered by:
├─ Low stock threshold reached
├─ Out of stock
└─ Product restocked

Recipients:
├─ Store notification_email
└─ Hardcoded in alert_channels
```

### Slack Notifications
```
Setup:
├─ Package: @slack/webhook
├─ Webhook URL: (from store_settings.slack_webhook_url)
└─ Or admin webhook: (from .env ADMIN_SLACK_WEBHOOK)

Messages:
├─ Low stock alerts
├─ Out of stock alerts
├─ Heartbeat status (issues found)
└─ Daily/weekly summaries (optional)
```

---

## Environment Variables

### Required for Startup
```bash
# Shopify
SHOPIFY_API_KEY=...
SHOPIFY_API_SECRET=...
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory
SHOPIFY_APP_URL=https://...
SHOPIFY_WEBHOOK_URL=https:.../api/webhooks

# Supabase
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# Email
EMAIL_HOST=smtp.zoho.com
EMAIL_PORT=587
EMAIL_USER=...
EMAIL_PASS=...

# Security
JWT_SECRET=...
```

### Optional for Features
```bash
# Heartbeat (6-hour check)
HEARTBEAT_SECRET=...

# Admin Slack notifications
ADMIN_SLACK_WEBHOOK=https://hooks.slack.com/...
```

---

## Development Workflow

### Running Locally
```bash
npm run dev
# Starts Next.js dev server on http://localhost:3000
# Hot reload enabled
# Middleware runs in development mode
```

### Testing an API Endpoint
```bash
# With session token
curl -X GET http://localhost:3000/api/products/stats \
  -H "Authorization: Bearer SESSION_TOKEN_HERE"

# Webhook (HMAC test)
curl -X POST http://localhost:3000/api/webhooks/inventory \
  -H "x-shopify-hmac-sha256: HMAC_HERE" \
  -H "x-shopify-topic: inventory_levels/update" \
  -d '{"inventory_item_id": 123, "available": 5}'
```

### Building for Production
```bash
npm run build
# Creates .next/ directory
# Outputs to .next/standalone/ (Docker)
```

### Deploying to Heroku
```bash
# Dockerfile included in repo
git push heroku main
# Builds Docker image
# Deploys to Heroku
```

---

## Deployment Architecture

### Current Setup
```
┌────────────────┐
│ GitHub Repo    │ (feat-billing branch)
└────────┬───────┘
         │ git push
         ▼
┌────────────────┐
│ Heroku App     │ (stock-alert)
├────────────────┤
│ - Docker build │
│ - npm run dev  │
│ - Next.js port│
│   (auto 3000)  │
└────────┬───────┘
         │ HTTPS
         ▼
    ┌──────────────────────────────┐
    │ Shopify                       │
    │ - OAuth endpoints             │
    │ - Webhook callbacks           │
    │ - Admin API access            │
    └──────────────────────────────┘
```

### Scaling Considerations
```
Current: Single Heroku dyno (serverless-like)
├─ Handles all requests sequentially
├─ In-memory state lost on restart
└─ No persistent background jobs

For Production:
├─ Add Redis for session storage
├─ Add external scheduler for heartbeat
├─ Consider load balancer if needed
└─ Monitor database connection limits
```

---

## Recommended Best Practices

### For This App
1. Use Supabase admin client only in API routes (not client-side)
2. Always verify session tokens in middleware
3. Log webhook events for debugging
4. Test webhooks in development (Shopify ngrok setup)
5. Monitor API rate limits (Shopify has 2 req/sec limit)
6. Clean up old data periodically (90+ days)
7. Keep tokens encrypted in database
8. Validate all Shopify webhook HMACs
9. Use transaction for multi-table updates
10. Cache frequently accessed data (store settings)

### Security Practices
1. Verify HMAC signature on all webhooks
2. Validate session tokens on every request
3. Use environment variables (never hardcode secrets)
4. Encrypt sensitive data at rest
5. Use HTTPS for all external communication
6. Implement rate limiting for public endpoints
7. Log security-relevant events
8. Rotate API keys periodically
9. Use service role key only server-side
10. Never expose tokens in client-side code

---

## Common Issues & Solutions

### Issue: 401 Unauthorized on Protected Routes
**Solution**: Check session token in Authorization header
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" /api/protected
```

### Issue: Webhook Not Triggering
**Solution**: Verify webhook is registered and HMAC matches
```sql
-- Check webhook registration
SELECT * FROM stores WHERE shop_domain = 'your-shop.myshopify.com';
```

### Issue: Database Connection Timeout
**Solution**: Check Supabase credentials and network
```typescript
const { data, error } = await supabaseAdmin
  .from('stores').select('count').limit(1);
if (error) console.error(error);
```

### Issue: Inventory Not Updating
**Solution**: Check webhook is triggered, cache isn't blocking, settings allow
```sql
SELECT * FROM inventory_tracking WHERE store_id = 'STORE_ID'
ORDER BY updated_at DESC LIMIT 5;
```

---

## File Location Reference

### API Routes
```
app/api/auth/route.ts
app/api/auth/callback/route.ts
app/api/auth/token-exchange/route.ts
app/api/auth/session/route.ts
app/api/auth/verify/route.ts

app/api/webhooks/inventory/route.ts
app/api/webhooks/uninstall/route.ts
app/api/webhooks/register/route.ts
app/api/webhooks/list/route.ts
app/api/webhooks/compliance/route.ts

app/api/products/list/route.ts
app/api/products/sync/route.ts
app/api/products/validate/route.ts
app/api/products/reset/route.ts
app/api/products/stats/route.ts

app/api/billing/route.ts
app/api/billing/callback/route.ts

app/api/health/route.ts
app/api/setup-progress/route.ts
app/api/internal/heartbeat/route.ts (NEW - recommended)
```

### Utility Files
```
lib/supabase.ts
lib/shopify.ts
lib/notifications.ts
lib/email-templates.ts
lib/token-manager.ts
lib/session-token.ts
lib/session-token-edge.ts
lib/plan-enforcement.ts
lib/request-queue.ts
lib/heartbeat.ts (NEW - recommended)
```

### Config Files
```
middleware.ts
next.config.ts
tsconfig.json
.env.local (development)
.env.production (production)
```

### Database
```
supabase/schema.sql (main)
supabase/migrations/add_billing_columns.sql
supabase/migrations/add_inventory_status.sql
supabase/migrations/add_heartbeat_table.sql (NEW - recommended)
```

### Documentation
```
docs/architecture/backend-architecture-analysis.md
docs/architecture/heartbeat-implementation-guide.md
docs/architecture/BACKEND_QUICK_REFERENCE.md (this file)
docs/architecture/database-schema.md
docs/architecture/system-architecture.md
```

---

## Quick Start for New Developer

1. **Clone & Setup**
   ```bash
   git clone <repo>
   cd stock-alert
   npm install
   cp .env.example .env.local
   ```

2. **Environment**
   - Get Shopify credentials from Shopify Partner Dashboard
   - Get Supabase credentials from Supabase project
   - Run database migrations in Supabase

3. **Run Locally**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

4. **Test Webhook (Local)**
   ```bash
   # Use Shopify ngrok setup or tunnel tool
   # Point Shopify webhook to: https://your-tunnel-url.com/api/webhooks/inventory
   ```

5. **Deploy**
   ```bash
   git push heroku main
   # Or use Heroku CLI
   ```

---

## Additional Resources

- [Shopify Admin API Docs](https://shopify.dev/docs/admin-api)
- [Supabase Documentation](https://supabase.com/docs)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Shopify Webhooks](https://shopify.dev/docs/admin-api/rest/reference/events/webhook)
- [Polaris Design System](https://polaris.shopify.com/)

