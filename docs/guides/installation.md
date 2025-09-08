# Installation Guide

## Getting Started with Stock Alert

Welcome to Stock Alert! This guide will walk you through installing and setting up the app for your Shopify store.

---

## Installation Steps

### Step 1: Install from Shopify App Store

1. Visit the [Stock Alert App Store listing](#) (Coming Soon)
2. Click **"Add app"** button
3. You'll be redirected to your Shopify admin

### Step 2: Authorize the App

You'll see a permissions screen listing what Stock Alert needs access to:

- ✅ **Read products** - View your product catalog
- ✅ **Write products** - Update product visibility
- ✅ **Read inventory** - Monitor stock levels
- ✅ **Write inventory** - No actual changes, just tracking

Click **"Install app"** to continue.

### Step 3: Initial Setup

After installation, you'll be taken to the app dashboard. Follow the setup wizard:

#### 1. Configure Basic Settings
- **Low Stock Threshold**: Set your default threshold (e.g., 5 items)
- **Auto-Hide Products**: Enable to automatically hide out-of-stock items
- **Email Notifications**: Enter your notification email address

#### 2. Choose Your Plan
- **Free Plan**: Perfect for small stores (up to 10 products)
- **Professional Plan**: For growing businesses (up to 10,000 products)

#### 3. Test Your Setup
- The app will send a test notification to verify everything works

---

## Quick Start Configuration

### Dashboard Overview

After installation, your dashboard shows:

```
┌─────────────────────────────────────┐
│         Stock Alert Dashboard        │
├─────────────────────────────────────┤
│ Products Tracked:        0 / 10     │
│ Low Stock Items:         0          │
│ Hidden Products:         0          │
│ Alerts Sent Today:       0          │
└─────────────────────────────────────┘
```

### Essential Settings

Navigate to **Settings** to configure:

#### 1. Global Threshold
Set the default low stock threshold for all products:
- Recommended: 10-20% of your average stock level
- Example: If you typically stock 50 items, set threshold to 5-10

#### 2. Notification Preferences

**Email Notifications (Free & Pro)**
- Primary email for alerts
- Alert frequency (immediate/daily digest)
- Alert types (low stock/out of stock/restocked)

**Slack Notifications (Pro Only)**
1. Create Slack webhook in your workspace
2. Add webhook URL to settings
3. Select channels for different alert types

#### 3. Automation Rules

**Auto-Hide Settings**
- ✅ Hide when out of stock
- ✅ Hide when below threshold (optional)
- ⏱️ Delay before hiding (0-60 minutes)

**Auto-Republish Settings (Pro)**
- ✅ Show when restocked
- ⏱️ Minimum stock to republish
- 📊 Check inventory every X minutes

---

## Product Configuration

### Automatic Tracking

Stock Alert automatically tracks all products with:
- Inventory tracking enabled in Shopify
- At least one variant with tracked inventory

### Manual Product Settings

For specific products, you can override global settings:

1. Go to **Products** page
2. Click on any product
3. Configure:
   - Custom threshold
   - Exclude from auto-hide
   - Exclude from alerts

### Bulk Operations

**Import Settings (Pro)**
1. Export current settings as CSV
2. Modify in spreadsheet
3. Import updated settings

---

## Testing Your Installation

### Verify Webhook Connection

1. Go to **Settings → System Status**
2. Check webhook status (should show "Connected")
3. Click "Test Webhook" to verify

### Test Inventory Sync

1. Change a product's inventory in Shopify
2. Check Stock Alert dashboard (updates within 1 minute)
3. Verify the change is reflected

### Test Notifications

1. Set a test product's threshold above current stock
2. Wait for alert (or click "Send Test Alert")
3. Check your email/Slack for notification

---

## Troubleshooting Installation

### App Not Loading

**Symptoms**: Blank screen or loading spinner
**Solutions**:
1. Clear browser cache
2. Try different browser
3. Disable ad blockers
4. Check Shopify admin permissions

### Webhooks Not Working

**Symptoms**: Inventory not updating
**Solutions**:
1. Reinstall the app
2. Check webhook status in settings
3. Verify store has active Shopify plan

### Notifications Not Received

**Email Issues**:
1. Check spam folder
2. Verify email address
3. Add `noreply@stockalert.app` to contacts
4. Check email provider limits

**Slack Issues**:
1. Verify webhook URL is correct
2. Check Slack channel permissions
3. Test webhook in Slack settings

---

## Best Practices

### Setting Thresholds

**Formula**: Threshold = (Daily Sales × Lead Time) + Safety Stock

**Example**:
- Daily sales: 5 units
- Supplier lead time: 7 days
- Safety stock: 10 units
- **Threshold: 45 units**

### Alert Management

**Avoid Alert Fatigue**:
- Set reasonable thresholds
- Use daily digest for non-critical items
- Reserve immediate alerts for bestsellers

**Priority Products**:
1. Mark bestsellers for immediate alerts
2. Set higher thresholds for fast-moving items
3. Exclude seasonal items during off-season

### Performance Optimization

**For Large Catalogs**:
- Use bulk operations for settings
- Set up collection-based rules (Pro)
- Archive discontinued products

---

## Frequently Asked Questions

### General Questions

**Q: How quickly does the app update inventory?**
A: Real-time via webhooks (usually within seconds)

**Q: Can I track specific variants only?**
A: Yes, the app tracks at variant level automatically

**Q: Does it work with multiple locations?**
A: Currently tracks total inventory across all locations

### Plan Questions

**Q: What happens if I exceed the free plan limit?**
A: You'll be prompted to upgrade. Existing tracked products continue working.

**Q: Can I downgrade from Pro to Free?**
A: Yes, but only first 10 products will remain tracked

**Q: Is there a trial period?**
A: Pro plan includes 7-day free trial

### Technical Questions

**Q: Does the app modify my inventory?**
A: No, it only reads inventory and modifies product visibility

**Q: Will hidden products affect SEO?**
A: Hidden products return 404, which is SEO-friendly for out-of-stock items

**Q: Can customers still access hidden product URLs?**
A: No, hidden products are completely inaccessible

---

## Getting Help

### Support Channels

- 📧 **Email**: support@stockalert.app
- 💬 **Live Chat**: Available in app (business hours)
- 📚 **Documentation**: docs.stockalert.app
- 🎥 **Video Tutorials**: YouTube channel

### Response Times

- **Free Plan**: 48-72 hours
- **Pro Plan**: 24 hours (priority support)
- **Critical Issues**: 4 hours (Pro only)

### Before Contacting Support

Please provide:
1. Store URL
2. Screenshot of issue
3. Steps to reproduce
4. Browser and device info

---

## Uninstallation

If you need to uninstall Stock Alert:

1. Go to Shopify Admin → Apps
2. Click "Delete" next to Stock Alert
3. Confirm deletion

**Note**: Uninstalling will:
- Remove all app data
- Cancel any active subscriptions
- Restore all hidden products
- Remove webhook subscriptions

**Data Export**: Export your settings and alert history before uninstalling if needed.

---

## Next Steps

✅ Installation complete!

**Recommended actions**:
1. [Configure your settings](./features.md)
2. [Set up notification channels](./features.md#notifications)
3. [Review billing options](./billing.md)
4. [Read best practices](./features.md#best-practices)

Welcome to Stock Alert! We're here to help you never miss a sale due to stockouts again.