# Troubleshooting: Only Write Scopes Granted

## The Problem
Shopify is only granting `write_products` and `write_inventory` but NOT `read_products` and `read_inventory`.

## This is INCORRECT Behavior
According to Shopify's documentation:
- Write scopes do NOT automatically include read permissions
- They are separate scopes that must be granted independently
- An app cannot function with only write permissions

## Possible Causes

### 1. Partner Dashboard Configuration Issue
Check your app configuration at: https://partners.shopify.com
- Go to your app
- Check "App setup" → "API access"
- Verify the scopes listed match what you're requesting

### 2. Development Store Permissions
The development store might have unusual permission settings:
- Check store settings
- Try with a different development store
- Create a fresh test store

### 3. App Installation State
The app might be in a partially installed state:
- Uninstall the app completely from the store
- Clear all browser cookies
- Reinstall fresh

## How to Fix

### Step 1: Check Partner Dashboard
1. Log in to Partners Dashboard
2. Select your app "Stock Alert"
3. Go to "Configuration" or "App setup"
4. Check "OAuth" or "API access scopes"
5. Ensure these are listed:
   - `read_products`
   - `write_products`
   - `read_inventory`
   - `write_inventory`

### Step 2: Uninstall and Reinstall
```bash
# 1. Uninstall from Shopify Admin
# Go to Settings → Apps → Stock Alert → Uninstall

# 2. Clear database records (optional)
# Run SQL in Supabase:
DELETE FROM stores WHERE shop_domain = 'stock-alert-2.myshopify.com';

# 3. Clear browser data
# Clear cookies for *.myshopify.com

# 4. Reinstall
# Visit: https://stock-alert-2.myshopify.com/admin/apps
# Install Stock Alert fresh
```

### Step 3: Test Actual Permissions
After installation, test what you can actually access:
```
https://dev.nazmulcodes.org/api/test-scopes?shop=stock-alert-2.myshopify.com
```

This will show:
- What scopes were granted
- Whether you can actually read products
- Whether you can actually read inventory

### Step 4: Manual Scope Request (if needed)
If the issue persists, try requesting scopes explicitly:
```javascript
// In shopify.app.toml
[access_scopes]
scopes = "read_products,read_inventory"  # Start with just read scopes

# Then later add:
scopes = "read_products,write_products,read_inventory,write_inventory"
```

## Verification Steps

1. **Check Current Scopes in Database**:
```sql
SELECT shop_domain, scope FROM stores WHERE shop_domain = 'stock-alert-2.myshopify.com';
```

2. **Check OAuth URL**:
The OAuth URL should include:
```
scope=read_products,write_products,read_inventory,write_inventory
```

3. **Check Token Exchange Response**:
The response from Shopify should include:
```json
{
  "access_token": "...",
  "scope": "read_products,write_products,read_inventory,write_inventory"
}
```

## Emergency Workaround

If you need to proceed immediately:
1. Temporarily modify the app to accept write-only scopes
2. Test if you can actually read data (sometimes it works despite the scope names)
3. Contact Shopify Partner Support if the issue persists

## Contact Support

If this issue continues:
1. Contact Shopify Partner Support
2. Provide:
   - App ID: a4c382e2cb454fd7c45b655248b2d1f7
   - Store: stock-alert-2.myshopify.com
   - Issue: Only write scopes granted, not read scopes
   - Expected: read_products,write_products,read_inventory,write_inventory
   - Received: write_products,write_inventory