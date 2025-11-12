# Stock Alert - Complete Project Documentation
Shopify app store url: https://apps.shopify.com/stock-alert-4
## Table of Contents

1. [Overview](#overview)
2. [App Information](#app-information)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Features & Functionality](#features--functionality)
6. [Database Schema](#database-schema)
7. [Authentication & Security](#authentication--security)
8. [API Routes](#api-routes)
9. [Webhooks](#webhooks)
10. [Notification System](#notification-system)
11. [Billing System](#billing-system)
12. [Frontend Components](#frontend-components)
13. [Environment Configuration](#environment-configuration)
14. [Deployment](#deployment)
15. [Development Workflow](#development-workflow)
16. [Shopify App Store Compliance](#shopify-app-store-compliance)
17. [Troubleshooting](#troubleshooting)

---

## Overview

**Stock Alert** is a Shopify embedded application that provides automated inventory management for Shopify merchants. The app monitors inventory levels in real-time, sends notifications when stock runs low, and automatically hides/shows products based on availability.

### Live App
- **Shopify App Store**: https://apps.shopify.com/stock-alert-4
- **Developer**: NazmulCodes
- **Current Version**: 1.0.0 (Live on App Store)

### Key Value Propositions
- Prevent overselling by automating product visibility
- Get instant low stock notifications via email and Slack
- Save time with automated inventory management
- Comprehensive alert history and tracking
- Custom thresholds per product (Pro plan)

---

## App Information

### Pricing Plans

#### Free Plan
- Auto-hide sold-out products
- Low stock email alerts
- Global threshold settings
- Monitor up to 10 products
- Basic email notifications

#### Professional Plan ($9.99/month)
- All Free features
- Slack notifications
- Per-product custom thresholds
- Auto-republish when restocked
- Multiple notification users
- Priority support
- Monitor up to 10,000 products
- 7-day free trial

### Target Audience
- Small to medium Shopify merchants
- Store owners needing automated inventory management
- Businesses wanting to prevent overselling
- Merchants managing multiple products

---

## Technology Stack

### Frontend
- **Framework**: Next.js 15.5.2 (App Router)
- **Runtime**: React 19.1.0
- **Language**: TypeScript 5
- **UI Library**: Shopify Polaris 12
- **Icons**: Shopify Polaris Icons 9.3.1
- **State Management**: Redux Toolkit 2.9.0
- **Styling**: Tailwind CSS 4
- **App Bridge**: Shopify App Bridge React 4.2.3

### Backend
- **Runtime**: Node.js 20
- **API Framework**: Next.js API Routes
- **Shopify SDK**: @shopify/shopify-api 11.14.1
- **Authentication**: JWT (jose 6.1.0, jsonwebtoken 9.0.2)
- **Security**: bcryptjs 3.0.2
- **HTTP Client**: axios 1.11.0

### Database
- **Service**: Supabase (PostgreSQL)
- **Client**: @supabase/supabase-js 2.57.2
- **Type**: Relational Database
- **Features**: Row Level Security, Stored Functions, Triggers

### Notification Services
- **Email**: Nodemailer 7.0.6
- **Email Provider**: Zoho Business Email (SMTP)
- **Slack**: @slack/webhook 7.0.6

### DevOps & Tools
- **Hosting**: Heroku
- **CI/CD**: GitHub Actions
- **Package Manager**: pnpm 10.6.3
- **Environment**: dotenv 17.2.2
- **Date Utilities**: date-fns 4.1.0

---

## System Architecture

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     SHOPIFY ADMIN (EMBEDDED)                    │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Stock Alert App (iFrame)                     │ │
│  │                                                           │ │
│  │  Dashboard → Products → Settings → Billing               │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        NEXT.JS APPLICATION                       │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │   Server    │  │   Client    │  │  API Routes │           │
│  │  Components │  │  Components │  │             │           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
│                                                                 │
│  Authentication Layer (OAuth + Session Tokens)                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BUSINESS LOGIC LAYER                        │
│                                                                 │
│  • Inventory Tracking    • Alert System     • Plan Enforcement │
│  • Webhook Processing    • Notification     • Billing Logic    │
│  • Product Sync          • Auto-Hide/Show   • Statistics       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                       DATA LAYER (SUPABASE)                      │
│                                                                 │
│  Tables: stores, store_settings, product_settings,             │
│  inventory_tracking, alert_history, billing_records,           │
│  webhook_events, setup_progress, gdpr_requests                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL INTEGRATIONS                       │
│                                                                 │
│  Shopify API → Email (SMTP) → Slack Webhooks                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Patterns

#### 1. Installation Flow
```
1. Merchant clicks "Install" from Shopify App Store
2. OAuth redirect to /api/auth with shop parameter
3. Generate PKCE challenge + nonce for security
4. Redirect to Shopify authorization page
5. Merchant approves scopes (read/write products, inventory)
6. Shopify redirects to /api/auth/callback with authorization code
7. Exchange code for permanent access token
8. Store credentials in database (stores table)
9. Register webhook subscriptions (inventory_levels/update)
10. Create default settings (store_settings table)
11. Initialize setup progress tracking
12. Redirect to app dashboard
```

#### 2. Inventory Update Flow
```
1. Merchant updates product inventory in Shopify
2. Shopify fires inventory_levels/update webhook
3. Webhook received at /api/webhooks/inventory
4. Validate HMAC signature for security
5. Check request cache to prevent duplicates (3-second TTL)
6. Return 200 OK immediately to Shopify
7. Process webhook asynchronously:
   a. Fetch product details via GraphQL
   b. Calculate total inventory across variants
   c. Determine inventory status (in_stock/low_stock/out_of_stock)
   d. Update inventory_tracking table
   e. Check if status changed from previous
   f. Send notifications if status changed
   g. Apply automation rules (auto-hide/republish)
8. Log event in webhook_events table
9. Update dashboard statistics
```

#### 3. Alert Notification Flow
```
1. Inventory status changes detected (e.g., in_stock → low_stock)
2. Check product settings for exclusions
3. Check store settings for enabled notifications
4. Compose professional email with template
5. Send email via SMTP (Nodemailer)
6. If Pro plan + Slack enabled:
   - Send formatted Slack message
   - Include action buttons
7. Log alert in alert_history table
8. Update last_alert_sent_at timestamp
9. Increment alert counter for dashboard
```

#### 4. Auto-Hide/Republish Flow
```
Auto-Hide (Out of Stock):
1. Product quantity reaches 0
2. Check if auto_hide_enabled in settings
3. Check if product excluded from auto-hide
4. Execute GraphQL mutation: product status → DRAFT
5. Update is_hidden = true in inventory_tracking
6. Send out-of-stock notification

Auto-Republish (Restocked):
1. Product quantity changes from 0 to > 0
2. Check if auto_republish_enabled in settings
3. Check if product excluded from auto-hide
4. Check if product is currently DRAFT
5. Execute GraphQL mutation: product status → ACTIVE
6. Update is_hidden = false in inventory_tracking
7. Send restock notification
```

---

## Features & Functionality

### Core Features

#### 1. Real-Time Inventory Monitoring
- Tracks all products and variants in store
- Updates in real-time via Shopify webhooks
- Displays current stock levels
- Shows inventory status (in_stock/low_stock/out_of_stock/deactivated)
- Historical tracking of quantity changes

**Implementation**: `/app/api/webhooks/inventory/route.ts`

#### 2. Automated Product Visibility
- **Auto-Hide**: Automatically set products to DRAFT when out of stock
- **Auto-Republish**: Automatically set products to ACTIVE when restocked
- Prevents customers from ordering out-of-stock items
- Per-product exclusion settings available

**Implementation**:
- Auto-hide logic: `/app/api/webhooks/inventory/route.ts:427-474`
- Auto-republish logic: `/app/api/webhooks/inventory/route.ts:477-543`

#### 3. Low Stock Alerts
- Configurable global threshold (default: 5 units)
- Per-product custom thresholds (Pro plan)
- Email notifications with professional templates
- Slack notifications with rich formatting (Pro plan)
- Status-based alerts (only trigger when status changes)
- Alert history and audit trail

**Implementation**:
- Notification system: `/lib/notifications.ts`
- Email templates: `/lib/email-templates.ts`

#### 4. Dashboard & Analytics
- Real-time statistics
- Products tracked count
- Low stock items count
- Out of stock items count
- Hidden products count
- Deactivated products count
- Alerts sent today
- Setup progress tracking

**Implementation**: `/app/page.tsx`, `/app/home-content.tsx`

#### 5. Product Management
- View all tracked products
- Filter by status (all/in_stock/low_stock/out_of_stock/deactivated)
- Search products by title or SKU
- Per-product threshold settings (Pro)
- Per-product exclusion settings (Pro)
- Bulk product sync from Shopify
- Product validation and reset

**Implementation**: `/app/products/products-table.tsx`

#### 6. Settings Management
- Global low stock threshold
- Auto-hide enabled/disabled
- Auto-republish enabled/disabled
- Email notifications enabled/disabled
- Slack notifications enabled/disabled
- Notification email configuration
- Slack webhook URL configuration

**Implementation**:
- Frontend: `/app/settings/settings-form.tsx`
- Backend: `/app/actions/settings.ts`

#### 7. Billing & Subscription Management
- Free plan (10 products)
- Pro plan ($9.99/month, 10,000 products)
- 7-day free trial for Pro plan
- Plan usage tracking
- Automatic plan enforcement
- Shopify recurring charge integration
- Upgrade/downgrade flows

**Implementation**:
- Billing API: `/app/api/billing/route.ts`
- Callback: `/app/api/billing/callback/route.ts`
- UI: `/app/billing/billing-content.tsx`
- Enforcement: `/lib/plan-enforcement.ts`

#### 8. Plan Enforcement
- Automatic product limit checks
- Deactivate products exceeding plan limit
- Real-time usage tracking
- Warning notifications
- Feature gating (Pro features)

**Implementation**: `/lib/plan-enforcement.ts`

### Advanced Features (Pro Plan)

#### Per-Product Settings
- Custom low stock thresholds per product
- Exclude specific products from auto-hide
- Exclude specific products from alerts
- Individual product monitoring rules

**Database**: `product_settings` table

#### Slack Integration
- Rich formatted messages
- Action buttons (View in Shopify)
- Color-coded alerts
- Real-time delivery
- Channel flexibility

**Implementation**: `/lib/notifications.ts:98-169`

#### Multiple Notification Recipients
- Configure multiple email addresses
- Team notifications
- Role-based alerting

---

## Database Schema

### Database Provider
- **Service**: Supabase
- **Engine**: PostgreSQL 15
- **Features**: Row Level Security, Stored Functions, Triggers, Indexes

### Schema Location
`/supabase/schema.sql` - Complete production-ready schema

### Tables Overview

#### 1. stores
Stores Shopify merchant information and authentication tokens.

```sql
Columns:
- id: uuid (PK)
- shop_domain: varchar (unique)
- access_token: text
- scope: text
- plan: varchar ('free' | 'pro')
- email: varchar
- scope_warning_shown: boolean
- created_at: timestamptz
- updated_at: timestamptz

Indexes:
- idx_stores_shop_domain ON (shop_domain)

Relations:
- One store → Many store_settings
- One store → Many product_settings
- One store → Many inventory_tracking
- One store → Many alert_history
- One store → Many billing_records
```

#### 2. store_settings
Global settings for each store.

```sql
Columns:
- id: uuid (PK)
- store_id: uuid (FK → stores.id)
- auto_hide_enabled: boolean (default: true)
- auto_republish_enabled: boolean (default: true)
- low_stock_threshold: integer (default: 5)
- email_notifications: boolean (default: true)
- slack_notifications: boolean (default: false)
- slack_webhook_url: text
- notification_email: varchar
- created_at: timestamptz
- updated_at: timestamptz

Indexes:
- idx_store_settings_store_id ON (store_id)
```

#### 3. product_settings
Per-product configuration (Pro plan feature).

```sql
Columns:
- id: uuid (PK)
- store_id: uuid (FK → stores.id)
- product_id: bigint
- product_title: text
- custom_threshold: integer
- exclude_from_auto_hide: boolean (default: false)
- exclude_from_alerts: boolean (default: false)
- created_at: timestamptz
- updated_at: timestamptz

Indexes:
- idx_product_settings_store_product ON (store_id, product_id)
- unique constraint ON (store_id, product_id)
```

#### 4. inventory_tracking
Real-time inventory status for all products.

```sql
Columns:
- id: uuid (PK)
- store_id: uuid (FK → stores.id)
- product_id: bigint
- variant_id: bigint (nullable, deprecated)
- product_title: text
- variant_title: text (nullable)
- sku: varchar (nullable)
- current_quantity: integer (default: 0)
- previous_quantity: integer
- inventory_status: varchar ('in_stock'|'low_stock'|'out_of_stock'|'deactivated')
- is_hidden: boolean (default: false)
- last_checked_at: timestamptz
- last_alert_sent_at: timestamptz
- created_at: timestamptz
- updated_at: timestamptz

Indexes:
- idx_inventory_tracking_store_id ON (store_id)
- idx_inventory_tracking_product_id ON (product_id)
- idx_inventory_tracking_status ON (inventory_status)
- idx_inventory_tracking_store_product ON (store_id, product_id)

Note: Product-level tracking only (variants aggregated)
```

#### 5. alert_history
Audit trail of all notifications sent.

```sql
Columns:
- id: uuid (PK)
- store_id: uuid (FK → stores.id)
- product_id: bigint
- product_title: text
- variant_id: bigint (nullable)
- alert_type: varchar ('low_stock'|'out_of_stock'|'restock')
- quantity_at_alert: integer
- threshold_triggered: integer
- sent_to_email: varchar
- sent_to_slack: boolean
- sent_at: timestamptz (default: now())
- created_at: timestamptz

Indexes:
- idx_alert_history_store_id ON (store_id)
- idx_alert_history_sent_at ON (sent_at)
```

#### 6. billing_records
Shopify recurring charge information.

```sql
Columns:
- id: uuid (PK)
- store_id: uuid (FK → stores.id)
- charge_id: bigint
- plan: varchar ('free'|'pro')
- status: varchar ('pending'|'active'|'cancelled'|'declined')
- amount: decimal
- currency: varchar (default: 'USD')
- trial_ends_on: date
- billing_on: date
- activated_on: timestamptz
- cancelled_on: timestamptz
- created_at: timestamptz
- updated_at: timestamptz

Indexes:
- idx_billing_records_store_id ON (store_id)
- idx_billing_records_status ON (status)
```

#### 7. webhook_events
Webhook processing log and debugging.

```sql
Columns:
- id: uuid (PK)
- store_id: uuid (FK → stores.id)
- topic: varchar
- payload: jsonb
- processed: boolean (default: false)
- processed_at: timestamptz
- error_message: text
- created_at: timestamptz

Indexes:
- idx_webhook_events_store_id ON (store_id)
- idx_webhook_events_processed ON (processed)
```

#### 8. setup_progress
Track merchant onboarding completion.

```sql
Columns:
- id: uuid (PK)
- store_id: uuid (FK → stores.id, unique)
- app_installed: boolean (default: true)
- global_settings_configured: boolean (default: false)
- notifications_configured: boolean (default: false)
- product_thresholds_configured: boolean (default: false)
- first_product_tracked: boolean (default: false)
- created_at: timestamptz
- updated_at: timestamptz
```

#### 9. gdpr_requests
GDPR compliance tracking.

```sql
Columns:
- id: uuid (PK)
- shop_domain: varchar
- request_type: varchar ('customer_data'|'customer_redact'|'shop_redact')
- webhook_payload: jsonb
- processed: boolean (default: false)
- processed_at: timestamptz
- created_at: timestamptz

Indexes:
- idx_gdpr_requests_processed ON (processed)
```

### Database Functions

#### get_inventory_stats(p_store_id uuid)
Returns aggregated statistics for dashboard (optimized single query).

```sql
Returns:
- total_products: integer
- low_stock: integer
- out_of_stock: integer
- hidden: integer
- deactivated: integer
- alerts_today: integer
```

#### bulk_upsert_inventory(...)
Bulk insert/update products during sync operations.

---

## Authentication & Security

### OAuth 2.0 Flow

#### Initial Installation
1. **Authorization Request** (`/api/auth`):
   - Generates cryptographic nonce (32 bytes)
   - Creates PKCE challenge (code_challenge + code_verifier)
   - Encodes state with shop domain + nonce
   - Sets secure cookies (SameSite=none, httpOnly, secure)
   - Redirects to Shopify authorization

2. **Authorization Callback** (`/api/auth/callback`):
   - Validates state parameter matches nonce
   - Validates HMAC signature
   - Exchanges authorization code for access token
   - Verifies PKCE code_verifier
   - Stores access token in database
   - Creates store settings and setup progress

**Implementation**:
- Auth route: `/app/api/auth/route.ts`
- Callback: `/app/api/auth/callback/route.ts`
- Validation: `/lib/oauth-validation.ts`

### Session Token Authentication

For embedded app requests after installation:

1. **Token Generation**:
   - Shopify App Bridge generates session token
   - Token contains: shop, user ID, expiry (1 minute)
   - Signed with app's API secret

2. **Token Verification**:
   - Extract token from Authorization header
   - Decode JWT without verification (to get issuer)
   - Fetch public key from Shopify
   - Verify signature using public key
   - Validate expiry and claims

**Implementation**: `/lib/session-token.ts`

### HMAC Validation

All incoming webhooks validated using HMAC-SHA256:

```typescript
const hash = crypto
  .createHmac('sha256', webhookSecret)
  .update(requestBody, 'utf8')
  .digest('base64');

const isValid = hash === hmacHeader;
```

**Implementation**: `/app/api/webhooks/inventory/route.ts:27-43`

### Security Features

1. **CSRF Protection**:
   - Nonce-based state validation
   - Time-limited cookies
   - Origin validation

2. **Data Encryption**:
   - Access tokens encrypted at rest
   - HTTPS/TLS for all communication
   - Environment variable secrets

3. **Rate Limiting**:
   - Webhook duplicate detection (3-second cache)
   - Request queue with throttling
   - Shopify API rate limit compliance

4. **Access Control**:
   - Store isolation (all queries filtered by store_id)
   - Row Level Security (RLS) on Supabase
   - No cross-store data access

5. **Input Validation**:
   - Shop domain format validation
   - Parameter sanitization
   - SQL injection prevention (parameterized queries)

---

## API Routes

### Base URL Structure
- Development: `http://localhost:3000/api`
- Production: `https://your-app-url.com/api`

### Authentication Routes

#### GET /api/auth
Start OAuth flow for app installation.

**Query Parameters**:
- `shop`: string (required) - Merchant shop domain
- `embedded`: string (optional) - "1" if embedded context

**Response**:
- HTML with iframe breakout script (embedded)
- 302 redirect to Shopify authorization (non-embedded)

**Implementation**: `/app/api/auth/route.ts`

#### GET /api/auth/callback
Handle OAuth callback from Shopify.

**Query Parameters**:
- `code`: string - Authorization code
- `shop`: string - Shop domain
- `state`: string - CSRF state token
- `hmac`: string - HMAC signature

**Response**:
- 302 redirect to app dashboard

**Implementation**: `/app/api/auth/callback/route.ts`

#### GET /api/auth/session
Session token authentication for embedded apps.

**Query Parameters**:
- `shop`: string (required)
- `host`: string (required)

**Response**:
- HTML with App Bridge initialization

**Implementation**: `/app/auth/session/page.tsx`

### Product Routes

#### GET /api/products/list
Fetch all tracked products for a store.

**Headers**:
- `Authorization`: Bearer {session_token}

**Query Parameters**:
- `shop`: string (required)

**Response**:
```json
{
  "products": [
    {
      "id": "uuid",
      "product_id": 123456789,
      "product_title": "Example Product",
      "sku": "SKU-123",
      "current_quantity": 50,
      "inventory_status": "in_stock",
      "is_hidden": false,
      "last_checked_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

**Implementation**: `/app/api/products/list/route.ts`

#### POST /api/products/sync
Sync products from Shopify to database.

**Headers**:
- `Authorization`: Bearer {session_token}

**Body**:
```json
{
  "shop": "example.myshopify.com"
}
```

**Response**:
```json
{
  "success": true,
  "synced": 150,
  "message": "Successfully synced 150 products"
}
```

**Implementation**: `/app/api/products/sync/route.ts`

#### POST /api/products/validate
Validate product data integrity.

**Implementation**: `/app/api/products/validate/route.ts`

#### GET /api/products/stats
Get product statistics for dashboard.

**Response**:
```json
{
  "totalProducts": 150,
  "lowStock": 12,
  "outOfStock": 5,
  "hidden": 3,
  "deactivated": 2,
  "alertsToday": 8
}
```

**Implementation**: `/app/api/products/stats/route.ts`

### Settings Routes

#### GET /api/settings
Fetch store settings (via Server Action).

**Implementation**: `/app/actions/settings.ts`

#### POST /api/settings
Update store settings (via Server Action).

**Body**:
```json
{
  "auto_hide_enabled": true,
  "auto_republish_enabled": true,
  "low_stock_threshold": 10,
  "email_notifications": true,
  "slack_notifications": true,
  "slack_webhook_url": "https://hooks.slack.com/...",
  "notification_email": "alerts@example.com"
}
```

**Implementation**: `/app/actions/settings.ts`

### Billing Routes

#### POST /api/billing
Create recurring charge for Pro plan.

**Body**:
```json
{
  "plan": "pro"
}
```

**Response**:
```json
{
  "confirmation_url": "https://example.myshopify.com/admin/charges/..."
}
```

**Implementation**: `/app/api/billing/route.ts`

#### GET /api/billing/callback
Handle billing charge approval.

**Query Parameters**:
- `charge_id`: string
- `shop`: string

**Implementation**: `/app/api/billing/callback/route.ts`

### Webhook Routes

#### POST /api/webhooks/inventory
Process inventory_levels/update webhooks.

**Headers**:
- `x-shopify-hmac-sha256`: string (HMAC signature)
- `x-shopify-shop-domain`: string
- `x-shopify-topic`: string

**Body**: Shopify webhook payload

**Response**:
```json
{
  "success": true,
  "message": "Webhook received and queued for processing"
}
```

**Implementation**: `/app/api/webhooks/inventory/route.ts`

#### POST /api/webhooks/register
Register webhook subscriptions with Shopify.

**Implementation**: `/app/api/webhooks/register/route.ts`

#### POST /api/webhooks/uninstall
Handle app uninstallation webhook.

**Implementation**: `/app/api/webhooks/uninstall/route.ts`

#### POST /api/webhooks/compliance
Handle GDPR webhooks.

**Topics**:
- `customers/data_request`
- `customers/redact`
- `shop/redact`

**Implementation**: `/app/api/webhooks/compliance/route.ts`

### Admin Routes

#### POST /api/admin/enforce-plan-limits
Enforce plan limits across all stores (background job).

**Implementation**: `/app/api/admin/enforce-plan-limits/route.ts`

### Health Check

#### GET /api/health
Check API health status.

**Response**:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**Implementation**: `/app/api/health/route.ts`

---

## Webhooks

### Registered Webhooks

#### inventory_levels/update
Fired when product inventory quantity changes.

**Payload**:
```json
{
  "inventory_item_id": 123456789,
  "location_id": 987654321,
  "available": 45,
  "updated_at": "2025-01-15T10:30:00Z"
}
```

**Processing Flow**:
1. Validate HMAC signature
2. Check duplicate cache (3-second TTL)
3. Return 200 OK immediately
4. Process asynchronously:
   - Fetch product via GraphQL
   - Calculate total inventory
   - Update inventory_tracking
   - Determine status change
   - Send notifications
   - Apply automation rules

**Endpoint**: `/app/api/webhooks/inventory`

#### app/uninstalled
Fired when merchant uninstalls the app.

**Actions**:
- Mark store as inactive
- Cancel active billing charges
- Cleanup scheduled for 48 hours (GDPR)

**Endpoint**: `/app/api/webhooks/uninstall`

#### customers/data_request (GDPR)
Request for customer data.

**Endpoint**: `/app/api/webhooks/compliance`

#### customers/redact (GDPR)
Request to delete customer data.

**Endpoint**: `/app/api/webhooks/compliance`

#### shop/redact (GDPR)
Request to delete shop data (after 48 hours).

**Endpoint**: `/app/api/webhooks/compliance`

### Webhook Security

1. **HMAC Verification**: All webhooks validated using SHA256 HMAC
2. **Duplicate Detection**: In-memory cache prevents duplicate processing
3. **Immediate Response**: Return 200 OK within 5 seconds
4. **Async Processing**: Heavy processing done in background
5. **Error Logging**: Failed webhooks logged to database
6. **Retry Handling**: Idempotent processing for Shopify retries

---

## Notification System

### Email Notifications

#### Provider Configuration
- **Service**: Zoho Business Email
- **Protocol**: SMTP
- **Host**: `smtp.zoho.com`
- **Port**: 587
- **Security**: STARTTLS

#### Email Templates

**Low Stock Alert** (`/lib/email-templates.ts:15-134`):
```
Subject: 🚨 Low Stock Alert - [Product Name]

Professional HTML template with:
- Product details
- Current quantity
- Threshold level
- Direct link to Shopify admin
- Branded footer
```

**Out of Stock Alert** (`/lib/email-templates.ts:136-251`):
```
Subject: ❌ Out of Stock - [Product Name]

Includes:
- Product now unavailable
- Product hidden notification
- Restock reminder
- Admin link
```

**Restock Alert** (`/lib/email-templates.ts:253-368`):
```
Subject: ✅ Product Back in Stock - [Product Name]

Includes:
- New stock level
- Product republished notification
- Admin link
```

#### Email Features
- HTML + Plain text versions
- Mobile-responsive design
- Professional branding
- Action buttons
- SKU and variant details
- Configurable recipients

**Implementation**: `/lib/notifications.ts:17-170`

### Slack Notifications (Pro Plan)

#### Configuration
- Incoming webhook URL from Slack
- Channel selection by merchant
- Rich message formatting

#### Message Format

**Low Stock Alert**:
```
🚨 Low Stock Alert

Product: Example Product
Variant: Blue / Large
SKU: SKU-123
Current Quantity: 3

[View in Shopify Button]
```

**Out of Stock Alert**:
```
❌ Out of Stock Alert

Product: Example Product
Variant: Blue / Large
SKU: SKU-123
Status: ⚠️ Product Hidden

[View in Shopify Button]
```

**Restock Alert**:
```
🎉 Product Back in Stock

Product: Example Product
Variant: Blue / Large
SKU: SKU-123
Current Quantity: 50

[View in Shopify Button]
```

**Implementation**: `/lib/notifications.ts:98-169`

### Notification Rules

#### When Alerts Are Sent

**Status-Based System** (prevents spam):
- Alert sent ONLY when inventory status changes
- No duplicate alerts for same status
- Cooldown enforced by status tracking

**Trigger Conditions**:
1. **Low Stock Alert**: Status changes from `in_stock` → `low_stock`
2. **Out of Stock Alert**: Status changes to `out_of_stock`
3. **Restock Alert**: Status changes from `out_of_stock` → `in_stock` or `low_stock`

#### Exclusions
- Products with `exclude_from_alerts = true` (Pro)
- Stores with notifications disabled
- Deactivated products (plan limit exceeded)

---

## Billing System

### Shopify Recurring Charges

#### Charge Creation Flow
1. Merchant clicks "Upgrade to Pro"
2. POST to `/api/billing` with `plan: "pro"`
3. Create recurring charge via Shopify API:
   ```json
   {
     "name": "Professional",
     "price": 9.99,
     "trial_days": 7,
     "return_url": "/api/billing/callback",
     "test": false
   }
   ```
4. Return `confirmation_url` to frontend
5. Redirect merchant to Shopify charge approval
6. Merchant approves charge
7. Shopify redirects to `/api/billing/callback`
8. Activate charge via Shopify API
9. Update store plan to "pro"
10. Update billing_records table
11. Redirect to app dashboard

**Implementation**:
- Create charge: `/app/api/billing/route.ts:128-213`
- Callback: `/app/api/billing/callback/route.ts`

#### Charge Lifecycle

**States**:
- `pending`: Charge created, awaiting approval
- `active`: Charge approved and active
- `declined`: Merchant declined charge
- `cancelled`: Charge cancelled by merchant or app

**Automatic Handling**:
- Trial period: 7 days free
- Billing cycle: Monthly
- Auto-renewal: Yes
- Cancellation: API-triggered on downgrade

#### Downgrade Flow
1. Merchant selects Free plan
2. POST to `/api/billing` with `plan: "free"`
3. Fetch active billing record
4. DELETE charge via Shopify API
5. Update billing_records status to "cancelled"
6. Update store plan to "free"
7. Enforce plan limits (deactivate excess products)

**Implementation**: `/app/api/billing/route.ts:213-255`

### Plan Enforcement

#### Product Limits
- **Free Plan**: 10 products
- **Pro Plan**: 10,000 products

#### Enforcement Logic (`/lib/plan-enforcement.ts`)

**canAddProduct(storeId)**:
```typescript
// Check current tracked count vs plan limit
// Return { canAdd: boolean, reason: string, limit: number }
```

**enforceStorePlanLimits(storeId)**:
```typescript
// Count active products
// If exceeds limit:
//   - Deactivate excess products
//   - Update inventory_status to 'deactivated'
//   - Send notification
```

**enforceAllStorePlanLimits()**:
```typescript
// Run across all stores (background job)
// Used for cleanup and enforcement
```

#### Enforcement Triggers
1. New product webhook received
2. Plan downgrade (Pro → Free)
3. Scheduled daily job (`/api/admin/enforce-plan-limits`)
4. Manual product sync

#### Deactivation Behavior
- Product marked as `inventory_status: 'deactivated'`
- No alerts sent for deactivated products
- No auto-hide/republish applied
- Product remains in database (data preserved)
- Can be reactivated by upgrading plan

---

## Frontend Components

### Page Structure

#### 1. Dashboard (`/app/page.tsx`)
**Server Component** - Main landing page and dashboard.

**Features**:
- Real-time statistics cards
- Setup progress tracker
- Quick action buttons
- Plan usage widget
- Active features list
- Pro features banner

**Data Loading**:
- Server-side data fetching (parallel)
- Statistics aggregation
- Recent alerts
- Setup progress

**Client Component**: `/app/home-content.tsx`

#### 2. Products Page (`/app/products/page.tsx`)
Product inventory management interface.

**Features**:
- DataTable with all products
- Status filtering (all, in_stock, low_stock, out_of_stock, deactivated)
- Search by title or SKU
- Per-product settings modal (Pro)
- Sync products button
- Reset/validate buttons

**Client Component**: `/app/products/products-table.tsx`

#### 3. Settings Page (`/app/settings/page.tsx`)
Global configuration interface.

**Tabs**:
1. **General Settings**:
   - Auto-hide enabled/disabled
   - Auto-republish enabled/disabled
   - Low stock threshold (1-100)

2. **Notifications**:
   - Email notifications toggle
   - Notification email address
   - Slack notifications toggle (Pro)
   - Slack webhook URL (Pro)
   - Test notifications button

**Client Component**: `/app/settings/settings-form.tsx`

#### 4. Billing Page (`/app/billing/page.tsx`)
Plan management and upgrade interface.

**Features**:
- Current plan display
- Plan comparison table
- Upgrade/downgrade buttons
- Usage statistics
- Payment history (future)

**Client Component**: `/app/billing/billing-content.tsx`

### Shared Components

#### PlanUsage (`/components/plan-usage.tsx`)
Displays current usage vs plan limit.

**Props**:
- `shop`: string
- `host`: string
- `plan`: 'free' | 'pro'
- `searchParams`: object

**Features**:
- Progress bar
- Usage count / limit
- Warning when approaching limit
- Upgrade prompt for free plan

#### AuthGuard (`/components/auth-guard.tsx`)
Protects routes requiring authentication.

**Features**:
- Session token validation
- Redirect to auth flow if invalid
- Loading state

#### PolarisProvider (`/components/polaris-provider.tsx`)
Shopify Polaris theme provider.

**Features**:
- App Bridge initialization
- Theme configuration
- i18n setup

#### ReduxProvider (`/components/redux-provider.tsx`)
Redux store provider for client components.

**Store Configuration**: `/store/`

---

## Environment Configuration

### Required Environment Variables

#### Shopify Configuration
```bash
# Shopify App Credentials
SHOPIFY_API_KEY=your_api_key_from_shopify_partners
SHOPIFY_API_SECRET=your_api_secret_from_shopify_partners

# OAuth Scopes (comma-separated)
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory

# App URLs
SHOPIFY_APP_URL=https://your-app-url.com
SHOPIFY_WEBHOOK_URL=https://your-app-url.com/api/webhooks
NEXT_PUBLIC_HOST=https://your-app-url.com
NEXT_PUBLIC_SHOPIFY_API_KEY=your_api_key_from_shopify_partners

# Webhook Security
SHOPIFY_WEBHOOK_SECRET=your_webhook_secret_from_shopify
```

#### Database Configuration (Supabase)
```bash
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

#### Email Configuration (Zoho SMTP)
```bash
EMAIL_HOST=smtp.zoho.com
EMAIL_PORT=587
EMAIL_USER=noreply@yourdomain.com
EMAIL_PASS=your_email_password
```

#### Security
```bash
JWT_SECRET=your_jwt_secret_256_bit_key
NODE_ENV=production

# Test mode for billing (optional)
TEST_PAYMENT=false
```

### Environment Files

#### `.env.local` (Development)
Local development environment variables.

#### `.env.production` (Production)
Production environment variables (used in Heroku).

#### `.env.example` (Template)
Template file for new installations.

**Location**: `/home/nazmul-hawlader/Desktop/App/App/shopify/stock-alert/.env.example`

---

## Deployment

### Production Deployment (Heroku)

#### Prerequisites
- Heroku account
- Heroku CLI installed
- Git repository connected

#### Deployment Files

**Dockerfile** (`/Dockerfile`):
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

**heroku.yml** (`/heroku.yml`):
```yaml
build:
  docker:
    web: Dockerfile
```

**GitHub Actions** (`.github/workflows/deploy.yml`):
```yaml
# Automatic deployment on push to main
# Uses Heroku API for deployment
```

#### Deployment Steps

1. **Configure Heroku App**:
   ```bash
   heroku create your-app-name
   heroku stack:set container
   ```

2. **Set Environment Variables**:
   ```bash
   heroku config:set SHOPIFY_API_KEY=xxx
   heroku config:set SHOPIFY_API_SECRET=xxx
   # ... all other env vars
   ```

3. **Deploy via Git**:
   ```bash
   git push heroku main
   ```

4. **Deploy via GitHub Actions**:
   - Push to `main` branch
   - GitHub Actions automatically deploys

**Current Deployment**: Heroku container-based deployment with automatic GitHub Actions CI/CD.

### Database Setup (Supabase)

1. Create Supabase project at https://app.supabase.com
2. Navigate to SQL Editor
3. Run schema file: `/supabase/schema.sql`
4. Enable Row Level Security on all tables
5. Copy connection strings to environment variables

### DNS & Domain

1. Configure custom domain in Heroku
2. Set up DNS records:
   - CNAME: `your-app.yourdomain.com` → `your-app.herokuapp.com`
3. Enable automatic HTTPS

### Post-Deployment Checklist

- [ ] Verify app loads in Shopify admin
- [ ] Test OAuth flow
- [ ] Register webhooks
- [ ] Test inventory updates
- [ ] Test email notifications
- [ ] Test Slack notifications
- [ ] Verify billing flow
- [ ] Check database connections
- [ ] Monitor error logs
- [ ] Test GDPR webhooks

---

## Development Workflow

### Local Development Setup

#### Prerequisites
- Node.js 20+
- pnpm 10.6.3
- PostgreSQL (via Supabase)
- Shopify Partner account
- ngrok or similar tunnel tool

#### Installation Steps

1. **Clone Repository**:
   ```bash
   git clone <repository-url>
   cd stock-alert
   ```

2. **Install Dependencies**:
   ```bash
   pnpm install
   ```

3. **Configure Environment**:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your credentials
   ```

4. **Setup Database**:
   - Create Supabase project
   - Run `/supabase/schema.sql`
   - Update database connection strings

5. **Setup Shopify App**:
   - Create app in Shopify Partners
   - Configure app URLs (via ngrok)
   - Copy API credentials

6. **Start Tunnel**:
   ```bash
   ngrok http 3000
   # Copy HTTPS URL to SHOPIFY_APP_URL
   ```

7. **Run Development Server**:
   ```bash
   pnpm dev
   ```

8. **Install in Test Store**:
   - Navigate to `https://your-ngrok-url.ngrok.io?shop=your-store.myshopify.com`
   - Complete OAuth flow

### Development Commands

```bash
# Start dev server (with Turbo)
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Run linter
pnpm lint

# Type check
npx tsc --noEmit
```

### Project Structure

```
stock-alert/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── auth/          # OAuth endpoints
│   │   ├── billing/       # Billing endpoints
│   │   ├── products/      # Product endpoints
│   │   ├── webhooks/      # Webhook handlers
│   │   └── ...
│   ├── actions/           # Server Actions
│   ├── dashboard/         # Dashboard page
│   ├── products/          # Products page
│   ├── settings/          # Settings page
│   ├── billing/           # Billing page
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home/dashboard page
├── components/            # React components
│   ├── providers/         # Context providers
│   └── ...
├── lib/                   # Utility libraries
│   ├── shopify.ts         # Shopify API client
│   ├── supabase.ts        # Database client
│   ├── notifications.ts   # Alert system
│   ├── session-token.ts   # Auth utilities
│   └── ...
├── types/                 # TypeScript types
├── store/                 # Redux store
├── supabase/              # Database schema
├── docs/                  # Documentation
├── public/                # Static assets
├── .env.local             # Local environment
├── .env.production        # Production environment
├── package.json           # Dependencies
├── next.config.ts         # Next.js config
├── tsconfig.json          # TypeScript config
└── Dockerfile             # Container config
```

### Git Workflow

**Branches**:
- `main`: Production-ready code
- `feat-*`: Feature branches
- `fix-*`: Bug fix branches

**Current Branch**: `feat-billing`

**Commit Convention**:
```
type(scope): description

Example:
feat(billing): Add Pro plan subscription flow
fix(webhooks): Fix duplicate processing bug
docs(readme): Update installation guide
```

### Testing

#### Manual Testing Checklist

**OAuth Flow**:
- [ ] Install app in development store
- [ ] Verify scopes are requested correctly
- [ ] Verify redirect after approval
- [ ] Check access token stored in database

**Inventory Tracking**:
- [ ] Create test product in Shopify
- [ ] Update inventory quantity
- [ ] Verify webhook received
- [ ] Verify inventory_tracking updated
- [ ] Verify dashboard stats updated

**Notifications**:
- [ ] Trigger low stock alert
- [ ] Verify email received
- [ ] Verify Slack message (Pro)
- [ ] Check alert_history record

**Auto-Hide/Republish**:
- [ ] Set product to 0 quantity
- [ ] Verify product set to DRAFT
- [ ] Restock product
- [ ] Verify product set to ACTIVE

**Billing**:
- [ ] Upgrade to Pro plan
- [ ] Verify charge created
- [ ] Approve charge in Shopify
- [ ] Verify plan updated
- [ ] Test plan enforcement

---

## Shopify App Store Compliance

### Required Webhooks

✅ **Registered**:
- `inventory_levels/update` - Core functionality
- `app/uninstalled` - Cleanup
- `customers/data_request` - GDPR compliance
- `customers/redact` - GDPR compliance
- `shop/redact` - GDPR compliance

### Data Privacy

#### Data Collected
- Store domain
- Access token (encrypted)
- Store email
- Product IDs, titles, SKUs
- Inventory quantities
- Alert history

#### Data Retention
- Active stores: Indefinite
- Uninstalled apps: 48 hours before deletion
- GDPR requests: Immediate processing

#### Data Sharing
- No third-party sharing
- No customer PII collected
- Notification emails sent via app only

### App Requirements Checklist

✅ **Embedded App**:
- Uses Shopify App Bridge 4
- Properly embedded in Shopify admin
- No external redirects

✅ **Authentication**:
- OAuth 2.0 implementation
- Session token authentication
- HMAC validation for webhooks

✅ **Scopes**:
- `read_products` - View product data
- `write_products` - Update product status
- `read_inventory` - View inventory levels
- `write_inventory` - (Not currently used, can be removed)

✅ **Billing**:
- Shopify recurring charge API
- No external payment processing
- Transparent pricing

✅ **Performance**:
- Webhook processing < 5 seconds
- Dashboard loads < 2 seconds
- Async background processing

✅ **GDPR Compliance**:
- Data request webhook
- Customer redact webhook
- Shop redact webhook
- Privacy policy page
- Terms of service page

---

## Troubleshooting

### Common Issues

#### 1. OAuth Loop / Redirect Issues

**Symptom**: App keeps redirecting to OAuth flow.

**Causes**:
- Cookies not set properly (SameSite issues)
- Invalid HMAC validation
- State parameter mismatch

**Solutions**:
```typescript
// Check cookie settings
sameSite: 'none'  // Required for embedded apps
secure: true      // Required with sameSite=none
httpOnly: true    // Security best practice

// Verify state parameter
const encodedState = createEncodedState({ nonce, shop });
// Must match on callback
```

**Files**:
- `/app/api/auth/route.ts:54-65`
- `/app/api/auth/callback/route.ts`

#### 2. Webhooks Not Received

**Symptom**: Inventory updates not reflected in app.

**Checks**:
1. Verify webhooks registered:
   ```bash
   curl -X GET \
     https://{shop}.myshopify.com/admin/api/2024-01/webhooks.json \
     -H 'X-Shopify-Access-Token: {token}'
   ```

2. Check webhook URL is publicly accessible

3. Verify HMAC validation:
   ```typescript
   const hash = crypto
     .createHmac('sha256', secret)
     .update(body, 'utf8')
     .digest('base64');
   ```

4. Check Shopify webhook delivery logs in Partners dashboard

**Files**: `/app/api/webhooks/inventory/route.ts:27-43`

#### 3. Email Notifications Not Sending

**Symptom**: Low stock alerts not received via email.

**Checks**:
1. Verify SMTP credentials:
   ```bash
   # Test connection
   telnet smtp.zoho.com 587
   ```

2. Check email settings in store_settings table

3. Verify `email_notifications = true`

4. Check alert_history for sent records

5. Review application logs for errors

**Files**: `/lib/notifications.ts:58-95`

#### 4. Slack Notifications Not Working

**Symptom**: Slack messages not received (Pro plan).

**Checks**:
1. Verify Slack webhook URL format:
   ```
   https://hooks.slack.com/services/TXXXXX/BXXXXX/your-webhook-token
   ```

2. Check store plan is "pro"

3. Verify `slack_notifications = true`

4. Test webhook URL:
   ```bash
   curl -X POST -H 'Content-type: application/json' \
     --data '{"text":"Test message"}' \
     YOUR_WEBHOOK_URL
   ```

**Files**: `/lib/notifications.ts:98-169`

#### 5. Plan Limits Not Enforced

**Symptom**: Free plan tracking more than 10 products.

**Checks**:
1. Verify store plan in database:
   ```sql
   SELECT plan FROM stores WHERE shop_domain = 'example.myshopify.com';
   ```

2. Run enforcement manually:
   ```bash
   curl -X POST https://your-app.com/api/admin/enforce-plan-limits
   ```

3. Check deactivated products:
   ```sql
   SELECT COUNT(*) FROM inventory_tracking
   WHERE store_id = 'xxx' AND inventory_status = 'deactivated';
   ```

**Files**: `/lib/plan-enforcement.ts`

#### 6. Database Connection Issues

**Symptom**: 500 errors, database timeout errors.

**Checks**:
1. Verify Supabase connection strings
2. Check Supabase project status
3. Verify network connectivity
4. Check connection pool settings

**Files**: `/lib/supabase.ts`

#### 7. Session Token Expired

**Symptom**: "Unauthorized" errors in embedded app.

**Cause**: Session tokens expire after 1 minute.

**Solution**: App Bridge automatically refreshes tokens. Ensure:
```typescript
// Extract token on each request
const token = await getSessionTokenFromRequest(req);

// Validate expiry
const decoded = jwtDecode(token);
if (decoded.exp < Date.now() / 1000) {
  throw new Error('Token expired');
}
```

**Files**: `/lib/session-token.ts`

### Debug Mode

Enable verbose logging:

```bash
# Set in .env.local
DEBUG=true
LOG_LEVEL=debug
```

### Support Contacts

- **Developer**: info@nazmulcodes.org
- **GitHub Issues**: [Repository Issues]
- **Shopify Partners Dashboard**: App review status

---

## Additional Resources

### Documentation Files

Comprehensive docs available in `/docs/`:

- **Architecture**: `/docs/architecture/system-architecture.md`
- **Database Schema**: `/docs/architecture/database-schema.md`
- **API Reference**: `/docs/api/rest-api.md`
- **Deployment Guide**: `/docs/deployment/deployment-guide.md`
- **Getting Started**: `/docs/development/getting-started.md`

### OAuth & App Bridge Docs

- `/docs/oauth-implementation-final.md` - Complete OAuth guide
- `/docs/app-bridge-implementation.md` - App Bridge setup
- `/docs/shopify-compliance-100-percent-achieved.md` - Compliance checklist

### Review & Compliance Docs

- `/docs/shopify-app-review-checklist.md` - App Store review prep
- `/docs/shopify-compliance-audit-complete.md` - Compliance audit
- `/docs/scope-issue-resolution.md` - Scope troubleshooting

### Project Rules

See `/CLAUDE.md` for development guidelines:
- Always test remote URLs before importing
- Reuse existing components
- Use semantic naming
- Follow Shopify best practices
- Never use deprecated Polaris components
- Use .env.local for configuration
- Document in /docs/
- Never assume issues - findout exact problems
- Adapt existing files, don't change API routes
- Avoid unnecessary file creation

---

## Changelog

### Version 1.0.0 (Current - Live on App Store)
- ✅ Complete OAuth 2.0 implementation with PKCE
- ✅ Session token authentication for embedded apps
- ✅ Real-time inventory tracking via webhooks
- ✅ Auto-hide/republish functionality
- ✅ Email notifications with professional templates
- ✅ Slack integration (Pro plan)
- ✅ Per-product settings (Pro plan)
- ✅ Billing system with 7-day trial
- ✅ Plan enforcement (10 products free, 10k Pro)
- ✅ GDPR compliance webhooks
- ✅ Dashboard with real-time stats
- ✅ Product management interface
- ✅ Settings management
- ✅ Shopify App Store approved

### Upcoming Features
- Analytics dashboard
- Advanced filtering
- Bulk operations
- Custom alert templates
- Multi-location support
- API rate limit optimization
- Performance improvements

---

## License & Copyright

© 2025 Stock Alert by NazmulCodes. All rights reserved.

This is a proprietary Shopify application. Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

---

## Document Information

**Document Version**: 1.0.0
**Last Updated**: January 16, 2025
**Author**: Claude Code Assistant
**Project Status**: Live on Shopify App Store

**This documentation covers the complete Stock Alert application as deployed and available on the Shopify App Store.**
