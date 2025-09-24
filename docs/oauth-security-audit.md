# OAuth 2.0 Security Audit Report

## Executive Summary
**CRITICAL SECURITY VULNERABILITIES FOUND** in the OAuth 2.0 implementation that must be fixed before going to production.

## 🔴 CRITICAL SECURITY ISSUES

### 1. ❌ NO HMAC Validation in OAuth Callback
**Location:** `/app/api/auth/callback/route.ts`
**Issue:** The callback does not validate the HMAC signature from Shopify
**Risk Level:** CRITICAL
**Impact:** Allows attackers to forge OAuth callbacks

**Current Code:**
```typescript
// HMAC is retrieved but NEVER validated!
const hmac = searchParams.get('hmac');
// No validation happens!
```

**Required Fix:**
```typescript
import crypto from 'crypto';

function validateHMAC(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get('hmac');
  if (!hmac) return false;

  // Remove hmac from params for validation
  const map = Object.fromEntries(params);
  delete map['hmac'];
  delete map['signature'];

  const message = Object.keys(map)
    .sort()
    .map(key => `${key}=${map[key]}`)
    .join('&');

  const hash = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return hash === hmac;
}
```

### 2. ❌ NO State Parameter Validation
**Location:** `/app/api/auth/route.ts` and `/app/api/auth/callback/route.ts`
**Issue:** State parameter is generated but never validated
**Risk Level:** CRITICAL
**Impact:** Vulnerable to CSRF attacks

**Current Issues:**
- State (nonce) is generated but not stored anywhere
- Callback doesn't validate the state parameter
- No session/cookie storage for state validation

**Required Fix:**
```typescript
// In /api/auth/route.ts
import { cookies } from 'next/headers';

// Store nonce in signed cookie
cookies().set('shopify-oauth-state', nonce, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 60 * 10, // 10 minutes
  signed: true
});

// In /api/auth/callback/route.ts
const storedState = cookies().get('shopify-oauth-state');
if (!state || state !== storedState?.value) {
  return NextResponse.json({ error: 'Invalid state parameter' }, { status: 403 });
}
```

### 3. ❌ No Shop Domain Validation in Callback
**Location:** `/app/api/auth/callback/route.ts`
**Issue:** Shop domain is not validated against regex pattern
**Risk Level:** HIGH
**Impact:** Could accept invalid shop domains

**Required Fix:**
```typescript
const VALID_SHOP_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

if (!shop || !VALID_SHOP_REGEX.test(shop)) {
  return NextResponse.json({ error: 'Invalid shop domain' }, { status: 400 });
}
```

## ⚠️ MEDIUM SEVERITY ISSUES

### 4. ⚠️ No PKCE Implementation
**Issue:** Not using Proof Key for Code Exchange
**Risk Level:** MEDIUM
**Impact:** Less secure OAuth flow

**Recommendation:** Implement PKCE for additional security:
```typescript
// Generate code verifier and challenge
const codeVerifier = base64URLEncode(crypto.randomBytes(32));
const codeChallenge = base64URLEncode(
  crypto.createHash('sha256').update(codeVerifier).digest()
);
```

### 5. ⚠️ No Rate Limiting on OAuth Endpoints
**Issue:** OAuth endpoints can be spammed
**Risk Level:** MEDIUM
**Impact:** Potential DoS vulnerability

## ✅ COMPLIANT AREAS

### 1. ✅ Shop Sanitization in Initial Request
**Location:** `/app/api/auth/route.ts`
```typescript
const sanitizedShop = shopify.utils.sanitizeShop(shop);
```

### 2. ✅ Proper Scope Encoding
**Location:** `/app/api/auth/route.ts`
```typescript
`scope=${encodeURIComponent(scopes)}`
```

### 3. ✅ Secure Token Storage
Tokens are stored in Supabase (external database) rather than client-side

## 📋 IMMEDIATE ACTION REQUIRED

### Priority 1: Critical Fixes (MUST DO NOW)
```typescript
// 1. Add HMAC validation to callback
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  // VALIDATE HMAC FIRST
  if (!validateHMAC(searchParams, process.env.SHOPIFY_API_SECRET!)) {
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 403 });
  }

  // VALIDATE STATE
  const state = searchParams.get('state');
  const storedState = cookies().get('shopify-oauth-state');
  if (!state || state !== storedState?.value) {
    return NextResponse.json({ error: 'Invalid state' }, { status: 403 });
  }

  // VALIDATE SHOP DOMAIN
  const shop = searchParams.get('shop');
  const VALID_SHOP_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;
  if (!shop || !VALID_SHOP_REGEX.test(shop)) {
    return NextResponse.json({ error: 'Invalid shop' }, { status: 400 });
  }

  // Continue with token exchange...
}
```

### Priority 2: Store State in Cookies
```typescript
// In auth route - store state
const nonce = crypto.randomBytes(16).toString('hex');
const cookieStore = cookies();
cookieStore.set('shopify-oauth-state', nonce, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 600 // 10 minutes
});
```

## 🔒 Security Best Practices Checklist

- ❌ HMAC signature validation
- ❌ State parameter validation (CSRF protection)
- ❌ Shop domain regex validation in callback
- ❌ PKCE implementation
- ❌ Rate limiting on OAuth endpoints
- ✅ Shop sanitization in auth initiation
- ✅ Proper URL encoding of parameters
- ✅ HTTPS enforcement
- ✅ Secure token storage (database)
- ✅ Environment variable usage for secrets

## Compliance Score: 40/100 🔴

### Breakdown:
- HMAC Validation: 0/20 ❌
- State Validation: 0/20 ❌
- Shop Validation: 5/15 ⚠️
- PKCE Implementation: 0/10 ❌
- Rate Limiting: 0/10 ❌
- Parameter Encoding: 10/10 ✅
- Token Storage: 10/10 ✅
- HTTPS Usage: 5/5 ✅

## Conclusion

**THIS APP IS NOT SECURE FOR PRODUCTION USE** in its current state. The OAuth implementation has critical vulnerabilities that could allow:

1. **OAuth callback forgery** (no HMAC validation)
2. **CSRF attacks** (no state validation)
3. **Invalid shop domain acceptance** (no regex validation in callback)

These issues MUST be fixed before deploying to production or submitting to the Shopify App Store. The lack of HMAC and state validation alone would cause immediate rejection from Shopify's security review.

## References
- [Shopify OAuth Documentation](https://shopify.dev/docs/apps/auth/get-access-tokens/authorization-code-grant)
- [OAuth Security Best Practices RFC](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)
- [Shopify App Security Requirements](https://shopify.dev/docs/apps/store/security)