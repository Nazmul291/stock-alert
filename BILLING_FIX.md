# Billing 403 Forbidden Error - Solution

## The Problem
The Shopify API is returning `403 Forbidden` when trying to create recurring charges. This happens because:

1. **The app must be configured for billing in Shopify Partner Dashboard**
2. **The store might be a development store with billing restrictions**

## How to Fix

### Step 1: Configure App for Billing in Partner Dashboard

1. Go to your Shopify Partner Dashboard
2. Select your app "Stock Alert"
3. Go to **App setup** → **Payments**
4. Enable "Charge merchants for app usage"
5. Set up your pricing model (Recurring charge)
6. Save changes

### Step 2: Check Store Type

The store `stock-alert-2.myshopify.com` appears to be a development store. Development stores have restrictions:

- **Test charges only**: Development stores can only create test charges
- **The app is already setting `test: true`** in the billing request, which is correct

### Step 3: Verify App Installation

Make sure the app is properly installed:

1. Uninstall the app from the store
2. Reinstall it using the install link
3. Accept all permissions during installation

### Step 4: Alternative for Development

If billing still doesn't work on the development store:

1. Create a new development store specifically for billing testing
2. Or use a store with "Test charges enabled" in Partner Dashboard

## Technical Details

The error occurs because:
- GET request to `/shop.json` works (returns "Stock alert") ✓
- POST request to `/recurring_application_charges.json` returns 403 ✗

This confirms:
- Access token is valid ✓
- API version is correct (2024-10) ✓
- The issue is specifically with billing permissions ✗

## Code is Correct

Your code implementation is actually correct. The issue is with:
- App configuration in Partner Dashboard
- Store permissions/type

No code changes needed - this is a configuration issue.