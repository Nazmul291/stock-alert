# Session Token Authentication Implementation

## ✅ Shopify Guidelines Compliance

Our application correctly implements session tokens according to Shopify's requirements:

### 1. ✅ Session Token Retrieval via App Bridge

**Frontend Implementation:**
- `hooks/useAppBridge.ts` - Initializes Shopify App Bridge
- `hooks/useAuthenticatedFetch.ts` - Retrieves session tokens for API calls
- Session tokens are obtained via `window.shopify.idToken()` or `appBridge.idToken()`
- Supports both URL-based tokens and App Bridge token retrieval

### 2. ✅ Session Token Validation on Every Request

**Backend Implementation:**
- `lib/session-token.ts` - Centralized session token validation
- `middleware.ts` - Edge-level validation for protected routes
- All protected API routes validate session tokens before processing
- Uses `SHOPIFY_API_SECRET` for JWT signature verification

**Protected Routes (Session Token Required):**
- `/api/products/list`
- `/api/products/stats`
- `/api/products/sync`
- `/api/products/reset`
- `/api/products/validate`
- `/api/setup-progress`
- `/api/webhooks/register`
- `/api/webhooks/list`
- `/api/billing`

### 3. ✅ Not Using Session Tokens for Session Persistence

**Correct Implementation:**
- Session tokens are used ONLY for request authentication
- Tokens expire in 60 seconds (handled by JWT validation)
- No session storage or persistence of session tokens
- Fresh tokens retrieved for each authenticated request

### 4. ✅ Access Tokens for Shopify API Calls

**Separate Token Management:**
- Session tokens authenticate user requests to our API
- Access tokens (stored in database) are used for Shopify API calls
- `lib/shopify.ts` - Uses stored access tokens for REST/GraphQL clients
- Proper separation of concerns between authentication and API access

## Implementation Details

### Session Token Validation Flow:

1. **Frontend**: App Bridge provides session token
2. **Request**: Token sent in `Authorization: Bearer {token}` header
3. **Middleware**: Validates token signature and expiration
4. **API Route**: Uses `requireSessionToken()` for consistent validation
5. **Shopify API**: Uses stored access token from database

### Security Features:

- ✅ JWT signature verification with `SHOPIFY_API_SECRET`
- ✅ Token expiration checking (60 seconds)
- ✅ No shop parameter fallbacks (security vulnerability removed)
- ✅ HMAC validation for webhooks (separate from session tokens)
- ✅ Proper 401 error responses for invalid tokens

### Route Categories:

1. **Protected Routes** - Require valid session tokens
2. **OAuth Routes** - Public by design (`/api/auth/*`)
3. **Webhook Routes** - HMAC validated (`/api/webhooks/inventory`, etc.)
4. **Health Routes** - Public utilities (`/api/health`)

## Best Practices Followed:

✅ **Fresh Tokens**: New token retrieved for each request
✅ **No Persistence**: Tokens not stored client-side
✅ **Proper Expiration**: 60-second expiration respected
✅ **Signature Validation**: JWT verified with API secret
✅ **Error Handling**: Consistent 401 responses
✅ **Access Token Separation**: Database-stored tokens for Shopify API

This implementation ensures maximum security while following Shopify's authentication best practices.