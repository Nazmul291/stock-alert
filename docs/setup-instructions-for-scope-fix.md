# Setup Instructions - Scope Fix

## Required Database Migration

Run this SQL in your Supabase dashboard:

```sql
-- Add scope-related columns to stores table
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS scope_warning TEXT,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN stores.scope_warning IS 'Tracks any scope-related warnings or issues during OAuth installation';
COMMENT ON COLUMN stores.verified_at IS 'Timestamp of last access verification check';
```

## How to Apply:

1. **Go to Supabase Dashboard**
   - Navigate to: https://supabase.com/dashboard
   - Select your project

2. **Open SQL Editor**
   - Click on "SQL Editor" in the left sidebar

3. **Run Migration**
   - Copy the SQL above
   - Paste into the editor
   - Click "Run"

4. **Verify Columns Added**
   - Go to "Table Editor"
   - Select "stores" table
   - Check that `scope_warning` and `verified_at` columns exist

## Testing the Fix

### 1. Test OAuth Flow
The app should now complete installation even with unusual scopes:
- Visit: `https://dev.nazmulcodes.org/api/auth?shop=stock-alert-2.myshopify.com&embedded=1`
- Complete OAuth flow
- Should redirect to dashboard without errors

### 2. Check Access Verification
After installation, the dashboard will automatically verify access:
- Look for console logs showing verification results
- Banner will show if there are permission issues
- "Verify Access" button available to re-test

### 3. Manual Verification
You can manually test access at any time:
```
https://dev.nazmulcodes.org/api/verify-access
```
(Must be logged in with session token)

## What the Fix Does

### OAuth Callback (`/api/auth/callback`)
- ✅ Accepts any combination of scopes
- ✅ Stores warning if scopes are unusual
- ✅ Proceeds with installation regardless

### Access Verification (`/api/verify-access`)
- ✅ Tests actual API access
- ✅ Works even with only write scopes
- ✅ Updates database with results
- ✅ Clears warnings if access is good

### Dashboard
- ✅ Auto-verifies on first load
- ✅ Shows warning banner if issues
- ✅ Manual verify button
- ✅ Clear instructions for users

## Expected Console Output

### Successful Verification:
```
[Dashboard] Triggering access verification
[Dashboard] Access verification result: {canFunction: true, ...}
[Dashboard] ✅ Access verified successfully
[Access Verification] Can function: true
```

### Failed Verification:
```
[Dashboard] Access verification result: {canFunction: false, ...}
[Dashboard] Insufficient access detected
[Dashboard] Actual access: {canReadProducts: false, ...}
```

## Troubleshooting

### If verification fails:
1. Check browser console for detailed errors
2. Verify database migration was applied
3. Check that session token is valid
4. Try manual uninstall/reinstall

### If OAuth still fails:
1. Check Shopify Partner Dashboard settings
2. Verify API key and secret are correct
3. Check redirect URLs in app settings
4. Contact Shopify Partner Support

## Support

If issues persist after following these steps:
1. Check all console logs
2. Review `/docs/scope-issue-resolution.md`
3. Test with `/api/test-scopes?shop=your-shop.myshopify.com`
4. Check Shopify Partner Dashboard for app configuration