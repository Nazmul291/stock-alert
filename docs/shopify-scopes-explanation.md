# Shopify Scopes Explanation

## Scopes Required by Stock Alert App

### Essential Scopes (Minimum Required)
These scopes are required for the app to function at all:

1. **`read_products`** ✅
   - Read product information
   - Get product titles, SKUs, IDs
   - Required for displaying products in the app

2. **`read_inventory`** ✅
   - Read inventory levels
   - Track stock quantities
   - Monitor inventory changes
   - Core functionality of the app

### Enhanced Functionality Scopes
These scopes enable additional features but aren't strictly required:

3. **`write_products`** ⚠️
   - Update product status
   - Auto-hide out-of-stock products
   - Auto-republish when back in stock
   - **Note:** May require approval from Shopify

4. **`write_inventory`** ⚠️
   - Adjust inventory levels
   - Not currently used by the app
   - **Note:** Protected scope, requires Shopify approval

## Scope Approval Status

| Scope | Required | Approval Needed | Status |
|-------|----------|-----------------|---------|
| read_products | Yes | No | ✅ Always granted |
| read_inventory | Yes | No | ✅ Always granted |
| write_products | No | Sometimes | ⚠️ May not be granted |
| write_inventory | No | Yes | ⚠️ Often not granted |

## How the App Handles Missing Scopes

### If Only Read Scopes Granted:
✅ Inventory tracking works
✅ Low stock alerts work
✅ Dashboard displays correctly
❌ Auto-hide products disabled
❌ Auto-republish disabled

### Graceful Degradation:
The app now handles missing write scopes gracefully:
1. Checks which scopes were granted
2. Enables/disables features accordingly
3. Shows warnings in UI for disabled features
4. Continues with read-only functionality

## For Development

During development, Shopify often grants all requested scopes to development stores. However, in production:
- Basic read scopes are always granted
- Write scopes may require justification
- Some scopes require special approval

## Recommended Approach

1. **Start with minimum scopes**: `read_products,read_inventory`
2. **Add write scopes later**: Request them when user tries to use features that need them
3. **Progressive enhancement**: Enable features as scopes become available

## Testing Different Scope Scenarios

```bash
# Test with read-only scopes
SHOPIFY_SCOPES=read_products,read_inventory

# Test with all scopes (if approved)
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory
```

## User Communication

When write scopes are not available, the app should:
1. Disable auto-hide/republish toggles
2. Show tooltip explaining why
3. Provide link to request additional permissions
4. Continue working with read-only features