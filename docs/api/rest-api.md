# REST API Reference

## Base URL

```
Production: https://dev.nazmulcodes.org/api
Development: http://localhost:3000/api
```

## Authentication

All API endpoints require authentication via session cookies or API keys.

### Headers
```http
Cookie: shopify-session=<session-token>
Content-Type: application/json
```

---

## Endpoints

### Authentication

#### POST /api/auth
Initiate OAuth flow for Shopify app installation.

**Query Parameters:**
- `shop` (required): Shopify store domain

**Response:**
```http
302 Redirect to Shopify OAuth page
```

---

#### GET /api/auth/callback
Handle OAuth callback from Shopify.

**Query Parameters:**
- `code`: Authorization code
- `shop`: Store domain
- `state`: Security nonce

**Response:**
```http
302 Redirect to app dashboard
Set-Cookie: shopify-session=<token>
```

---

#### GET /api/auth/verify
Verify current session status.

**Response:**
```json
{
  "authenticated": true,
  "shop": "example.myshopify.com",
  "plan": "free"
}
```

---

### Products

#### GET /api/products
Retrieve tracked products with inventory data.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `search` (optional): Search term
- `filter` (optional): Status filter (low_stock, out_of_stock, hidden)

**Response:**
```json
{
  "products": [
    {
      "id": "7234567890123",
      "title": "Classic T-Shirt",
      "variants": [
        {
          "id": "42345678901234",
          "title": "Small / Blue",
          "sku": "CTS-S-BLU",
          "inventory_quantity": 15,
          "threshold": 5,
          "is_hidden": false,
          "last_alert": "2025-01-08T10:30:00Z"
        }
      ],
      "total_inventory": 45,
      "status": "in_stock"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 234,
    "pages": 5
  }
}
```

---

#### POST /api/products/sync
Synchronize products with Shopify store.

**Request Body:**
```json
{
  "full_sync": false,
  "product_ids": ["7234567890123"] // Optional: specific products
}
```

**Response:**
```json
{
  "success": true,
  "synced": 45,
  "updated": 12,
  "errors": 0
}
```

---

#### GET /api/products/validate
Check product limits based on plan.

**Query Parameters:**
- `shop` (required): Store domain

**Response:**
```json
{
  "store": {
    "plan": "free",
    "name": "Free",
    "maxProducts": 10
  },
  "validation": {
    "canAddProduct": true,
    "currentCount": 4,
    "maxProducts": 10,
    "message": "You can track 6 more products"
  },
  "stats": {
    "currentProducts": 4,
    "maxProducts": 10,
    "remainingSlots": 6
  }
}
```

---

#### PUT /api/products/:productId/settings
Update product-specific settings.

**Request Body:**
```json
{
  "custom_threshold": 10,
  "exclude_from_auto_hide": false,
  "exclude_from_alerts": false
}
```

**Response:**
```json
{
  "success": true,
  "product_id": "7234567890123",
  "settings": {
    "custom_threshold": 10,
    "exclude_from_auto_hide": false,
    "exclude_from_alerts": false
  }
}
```

---

### Settings

#### GET /api/settings
Retrieve store settings.

**Response:**
```json
{
  "auto_hide_enabled": true,
  "auto_republish_enabled": false,
  "low_stock_threshold": 5,
  "email_notifications": true,
  "slack_notifications": false,
  "slack_webhook_url": null,
  "notification_email": "admin@store.com"
}
```

---

#### PUT /api/settings
Update store settings.

**Request Body:**
```json
{
  "auto_hide_enabled": true,
  "low_stock_threshold": 10,
  "email_notifications": true,
  "notification_email": "alerts@store.com"
}
```

**Response:**
```json
{
  "success": true,
  "settings": {
    "auto_hide_enabled": true,
    "low_stock_threshold": 10,
    "email_notifications": true,
    "notification_email": "alerts@store.com"
  }
}
```

---

### Billing

#### POST /api/billing
Create or modify subscription.

**Request Body:**
```json
{
  "plan": "pro" // or "free" for downgrade
}
```

**Response (Upgrade):**
```json
{
  "confirmation_url": "https://example.myshopify.com/admin/charges/confirm"
}
```

**Response (Downgrade):**
```json
{
  "success": true,
  "plan": "free"
}
```

---

#### GET /api/billing/callback
Handle billing confirmation callback.

**Query Parameters:**
- `charge_id`: Shopify charge ID
- `shop`: Store domain

**Response:**
```http
302 Redirect to settings page
```

---

### Webhooks

#### POST /api/webhooks/inventory
Handle inventory level updates from Shopify.

**Headers:**
```http
X-Shopify-Topic: INVENTORY_LEVELS/UPDATE
X-Shopify-Hmac-Sha256: <hmac>
X-Shopify-Shop-Domain: example.myshopify.com
```

**Request Body:**
```json
{
  "inventory_item_id": 42345678901234,
  "location_id": 65432109876543,
  "available": 25,
  "updated_at": "2025-01-08T10:30:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "processed": true
}
```

---

#### POST /api/webhooks/products/update
Handle product updates from Shopify.

**Headers:**
```http
X-Shopify-Topic: PRODUCTS/UPDATE
X-Shopify-Hmac-Sha256: <hmac>
```

**Request Body:**
```json
{
  "id": 7234567890123,
  "title": "Updated Product Title",
  "variants": [...]
}
```

---

#### POST /api/webhooks/app/uninstalled
Handle app uninstallation.

**Headers:**
```http
X-Shopify-Topic: APP/UNINSTALLED
X-Shopify-Hmac-Sha256: <hmac>
```

**Response:**
```json
{
  "success": true,
  "data_removed": true
}
```

---

### Analytics

#### GET /api/analytics/dashboard
Get dashboard statistics.

**Response:**
```json
{
  "overview": {
    "total_products": 234,
    "low_stock_count": 12,
    "out_of_stock_count": 3,
    "hidden_products": 5,
    "alerts_sent_today": 8
  },
  "trends": {
    "alerts_7d": [2, 5, 3, 8, 4, 6, 8],
    "stockouts_7d": [0, 1, 0, 2, 1, 0, 3]
  },
  "top_alerts": [
    {
      "product_title": "Popular Item",
      "alert_count": 15,
      "current_stock": 2
    }
  ]
}
```

---

#### GET /api/analytics/alerts
Get alert history.

**Query Parameters:**
- `start_date` (optional): ISO date string
- `end_date` (optional): ISO date string
- `product_id` (optional): Filter by product
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response:**
```json
{
  "alerts": [
    {
      "id": "uuid",
      "product_title": "Classic T-Shirt",
      "variant_title": "Small / Blue",
      "alert_type": "low_stock",
      "quantity_at_alert": 3,
      "threshold_at_alert": 5,
      "sent_at": "2025-01-08T10:30:00Z",
      "channel": "email"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 156
  }
}
```

---

## Error Responses

All endpoints return consistent error responses:

### 400 Bad Request
```json
{
  "error": "Invalid request parameters",
  "details": {
    "field": "shop",
    "message": "Shop parameter is required"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired session"
}
```

### 403 Forbidden
```json
{
  "error": "Forbidden",
  "message": "This feature requires a Pro plan"
}
```

### 404 Not Found
```json
{
  "error": "Not found",
  "message": "Resource does not exist"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "retry_after": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

---

## Rate Limiting

API requests are rate limited to prevent abuse:

- **Per Store**: 100 requests per minute
- **Burst**: 20 requests per second
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Webhooks

### Webhook Security

All webhooks are verified using HMAC-SHA256:

```javascript
const crypto = require('crypto');

function verifyWebhook(rawBody, hmacHeader) {
  const hash = crypto
    .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  
  return hash === hmacHeader;
}
```

### Webhook Topics

Subscribed webhook topics:
- `INVENTORY_LEVELS/UPDATE` - Inventory changes
- `PRODUCTS/UPDATE` - Product modifications
- `PRODUCTS/DELETE` - Product deletion
- `APP/UNINSTALLED` - App removal

---

## Pagination

Standard pagination format for list endpoints:

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 234,
    "pages": 5,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## Testing

### Test Environment

```
Base URL: http://localhost:3000/api
Test Store: test-store.myshopify.com
```

### Postman Collection

Import the Postman collection for easy API testing:
[Download Collection](./postman-collection.json)

### cURL Examples

```bash
# Authenticate
curl -X GET "http://localhost:3000/api/auth?shop=test-store.myshopify.com"

# Get products
curl -X GET "http://localhost:3000/api/products" \
  -H "Cookie: shopify-session=<token>"

# Update settings
curl -X PUT "http://localhost:3000/api/settings" \
  -H "Content-Type: application/json" \
  -H "Cookie: shopify-session=<token>" \
  -d '{"low_stock_threshold": 10}'
```