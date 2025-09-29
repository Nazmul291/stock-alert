# OAuth Cookie Troubleshooting Guide

## Issue: Cookies Not Available in OAuth Callback

### Problem
When Shopify redirects back to your app after OAuth authorization, the cookies set in `/api/auth` are not available in `/api/auth/callback`.

### Root Cause
This is a **SameSite cookie issue**. The OAuth flow involves cross-site navigation:
1. Your app (`dev.nazmulcodes.org`) → Sets cookies
2. Redirects to Shopify (`shop.myshopify.com`) → Cross-site navigation
3. Shopify redirects back to your app → Cookies not sent due to SameSite

### Solution Implemented

#### Cookie Configuration
```typescript
const cookieOptions = {
  httpOnly: true,
  secure: true, // Required for sameSite: 'none'
  sameSite: 'none' as const, // Allows cross-site cookies
  maxAge: 600,
  path: '/',
  domain: '.nazmulcodes.org' // Allows subdomain access
};
```

### Key Points

1. **SameSite: 'none'** - Required for OAuth flows
   - Allows cookies to be sent on cross-site requests
   - Must be used with `secure: true`

2. **Secure: true** - Always required with sameSite: 'none'
   - Requires HTTPS even in development
   - Your dev environment uses HTTPS ✅

3. **Domain setting** - Optional but helpful
   - `.nazmulcodes.org` allows all subdomains
   - Helps with dev vs production environments

### Security Considerations

Using `sameSite: 'none'` is safe in this context because:
1. ✅ We validate HMAC signatures
2. ✅ We validate state parameters
3. ✅ Cookies are httpOnly (no JS access)
4. ✅ Short expiration (10 minutes)
5. ✅ Cleared after use

### Alternative Approaches (If cookies still fail)

#### Option 1: Session Storage
Store state in database with a session ID:
```typescript
// In /api/auth
const sessionId = crypto.randomUUID();
await supabase.from('oauth_sessions').insert({
  id: sessionId,
  state: nonce,
  shop: shop,
  expires_at: new Date(Date.now() + 600000)
});
// Redirect with sessionId in URL
```

#### Option 2: State Parameter Encoding
Encode everything in the state parameter:
```typescript
const state = Buffer.from(JSON.stringify({
  nonce,
  shop,
  timestamp: Date.now()
})).toString('base64url');
```

#### Option 3: URL Parameters
Pass through Shopify's OAuth:
- Some parameters like `shop` are preserved
- Can use these for validation

### Testing Checklist

1. Check browser console for cookie warnings
2. Verify HTTPS is used throughout
3. Check cookie headers in Network tab
4. Test in different browsers (Safari is strictest)
5. Clear cookies before testing

### Browser Differences

- **Chrome/Edge**: More lenient with sameSite
- **Safari**: Strictest cookie policies
- **Firefox**: Middle ground

### Debug Commands

```bash
# Check if cookies are set (in browser console)
document.cookie

# Check cookie headers (in curl)
curl -I https://dev.nazmulcodes.org/api/auth?shop=test.myshopify.com

# Monitor cookie flow
1. Open Network tab
2. Check Set-Cookie headers in /api/auth response
3. Check Cookie headers in /api/auth/callback request
```

### Current Implementation Status

✅ Cookies configured with sameSite: 'none'
✅ HTTPS enabled on dev.nazmulcodes.org
✅ Debug logging added
✅ HMAC validation as backup security

The cookies should now work properly across the OAuth redirect flow.