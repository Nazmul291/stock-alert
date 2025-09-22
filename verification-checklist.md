# Shopify Session Token & App Bridge Verification Checklist

## Browser Console Checks (When Logged Into Your App)

### 1. Verify App Bridge Script Loading
Open browser console and check:
```javascript
// Should return the Shopify App Bridge object
console.log(window.shopify);

// Should show App Bridge methods
console.log(Object.keys(window.shopify));
```

### 2. Check Session Token in URL
```javascript
// Check if session token is in URL
const urlParams = new URLSearchParams(window.location.search);
console.log('Session token in URL:', urlParams.get('id_token'));
```

### 3. Verify Authenticated Requests
In Network tab, look for requests to `/api/session-check` or any API endpoint:
- Should have `Authorization: Bearer <token>` header
- Should return 200 (not 401)

### 4. Test Session Token Endpoint Manually
```javascript
// Test the session check endpoint
fetch('/api/session-check', {
  headers: {
    'Authorization': `Bearer ${new URLSearchParams(window.location.search).get('id_token')}`,
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log('Session check result:', data));
```

## 2. Network Traffic Analysis

### Check for these patterns in browser DevTools > Network:
- ✅ Request to `https://cdn.shopify.com/shopifycloud/app-bridge.js`
- ✅ Requests with `Authorization: Bearer <jwt-token>` headers
- ✅ 200 responses from your API endpoints (not 401s)
- ✅ Regular requests to `/api/session-check` every 30 seconds

## 3. Manual API Testing

### Test your session endpoint directly:
```bash
# Get session token from browser URL, then test:
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
     -H "Content-Type: application/json" \
     https://your-app.com/api/session-check
```

Should return 200 with:
```json
{
  "authenticated": true,
  "shopDomain": "your-store.myshopify.com",
  "message": "Session token verified successfully"
}
```

## 4. Shopify CLI Verification

### Use Shopify CLI to test:
```bash
# In your app directory
shopify app info

# Check if your app is properly configured
shopify app env show
```

## 5. Partner Dashboard Indicators

### Look for these signs in Partner Dashboard:
- App Bridge check: "Using the latest App Bridge script loaded from Shopify's CDN" ✅
- Session token check: "Using session tokens for user authentication" ✅
- Status: Should show green checkmarks instead of pending

## 6. What Shopify's Automated Checker Does

Shopify's system likely:
1. Loads your app URL with test parameters
2. Checks if App Bridge script loads from their CDN
3. Makes requests to your API endpoints
4. Verifies session token headers are present
5. Confirms 401 responses without tokens, 200 with valid tokens

## Red Flags to Avoid
- ❌ 401 responses to all API requests
- ❌ No Authorization headers in requests
- ❌ App Bridge script not loading
- ❌ No session tokens in URL parameters
- ❌ API endpoints not protected by session token validation