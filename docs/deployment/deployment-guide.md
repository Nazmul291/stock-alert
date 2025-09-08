# Deployment Guide

## Overview

This guide covers deploying the Stock Alert Shopify app to production using Vercel, configuring environment variables, and setting up monitoring.

## Prerequisites

- Node.js 20.x or higher
- pnpm package manager
- Vercel account
- Supabase account
- Shopify Partner account
- Domain name (for production URL)

---

## Deployment Architecture

```
GitHub Repository
       │
       ▼
  Vercel CI/CD
       │
   ┌───┴───┐
   │       │
Preview  Production
Branches  (main)
```

---

## Step-by-Step Deployment

### 1. Prepare the Application

#### Install Dependencies
```bash
pnpm install
```

#### Build Locally (Test)
```bash
pnpm build
```

#### Run Production Build
```bash
pnpm start
```

### 2. Environment Configuration

Create environment files for each environment:

#### Development (.env.local)
```env
# Shopify Configuration
SHOPIFY_API_KEY=your_dev_api_key
SHOPIFY_API_SECRET=your_dev_api_secret
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory
SHOPIFY_APP_URL=https://dev.yourdomain.com
SHOPIFY_WEBHOOK_URL=https://dev.yourdomain.com/api/webhooks

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Email Configuration
EMAIL_HOST=smtp.zoho.com
EMAIL_PORT=587
EMAIL_USER=alerts@yourdomain.com
EMAIL_PASS=your_email_password

# Slack Configuration (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# JWT Configuration
JWT_SECRET=your_secure_jwt_secret

# App Configuration
NODE_ENV=development
NEXT_PUBLIC_HOST=https://dev.yourdomain.com
NEXT_PUBLIC_SHOPIFY_API_KEY=your_dev_api_key
```

#### Production (.env.production)
```env
# Same structure as development but with production values
NODE_ENV=production
NEXT_PUBLIC_HOST=https://app.yourdomain.com
# ... other production values
```

### 3. Vercel Setup

#### Install Vercel CLI
```bash
npm i -g vercel
```

#### Login to Vercel
```bash
vercel login
```

#### Initialize Project
```bash
vercel
```

Answer the prompts:
- Set up and deploy: Y
- Which scope: Your account
- Link to existing project: N
- Project name: stock-alert
- Directory: ./
- Override settings: N

### 4. Configure Vercel Project

#### Add Environment Variables

In Vercel Dashboard:
1. Go to Project Settings → Environment Variables
2. Add all variables from `.env.production`
3. Set scope: Production

#### Configure Domains

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records:
```
Type: CNAME
Name: app
Value: cname.vercel-dns.com
```

#### Build & Development Settings

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "installCommand": "pnpm install",
  "devCommand": "pnpm dev"
}
```

### 5. Database Setup

#### Supabase Configuration

1. Create new Supabase project
2. Run migration scripts:
```bash
# Connect to Supabase
supabase db remote set postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Run migrations
supabase db push
```

#### Database Schema
```sql
-- Run the schema creation script from docs/architecture/database-schema.md
```

### 6. Shopify App Configuration

#### Update App URLs

In Shopify Partner Dashboard:
1. Go to App Setup → URLs
2. Update:
   - App URL: `https://app.yourdomain.com`
   - Redirect URLs:
     - `https://app.yourdomain.com/api/auth/callback`
     - `https://app.yourdomain.com/auth/callback`

#### Configure Webhooks

```javascript
// Webhook endpoints to register
const webhooks = [
  {
    topic: 'INVENTORY_LEVELS/UPDATE',
    address: 'https://app.yourdomain.com/api/webhooks/inventory'
  },
  {
    topic: 'PRODUCTS/UPDATE',
    address: 'https://app.yourdomain.com/api/webhooks/products/update'
  },
  {
    topic: 'PRODUCTS/DELETE',
    address: 'https://app.yourdomain.com/api/webhooks/products/delete'
  },
  {
    topic: 'APP/UNINSTALLED',
    address: 'https://app.yourdomain.com/api/webhooks/app/uninstalled'
  }
];
```

### 7. Deploy to Production

#### Manual Deployment
```bash
vercel --prod
```

#### Automatic Deployment (GitHub)

1. Connect GitHub repository to Vercel
2. Configure branch deployments:
   - Production: main branch
   - Preview: all other branches
3. Enable automatic deployments

### 8. Post-Deployment Tasks

#### Verify Deployment
```bash
# Check deployment status
vercel ls

# View logs
vercel logs stock-alert --follow
```

#### Health Checks
```bash
# Test API endpoint
curl https://app.yourdomain.com/api/health

# Test webhook endpoint
curl -X POST https://app.yourdomain.com/api/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
```

#### Configure Monitoring

1. **Vercel Analytics**
   - Enable in Project Settings
   - Add analytics script to layout

2. **Error Tracking (Sentry)**
```bash
pnpm add @sentry/nextjs
```

Configure Sentry:
```javascript
// sentry.client.config.js
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

3. **Uptime Monitoring**
   - Use UptimeRobot or similar
   - Monitor: `https://app.yourdomain.com/api/health`
   - Alert threshold: 5 minutes

---

## Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Build successful locally
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] Shopify app settings updated

### Deployment
- [ ] Deploy to Vercel
- [ ] Verify deployment successful
- [ ] Test critical paths
- [ ] Monitor error rates

### Post-Deployment
- [ ] Update DNS records
- [ ] Configure SSL certificate
- [ ] Set up monitoring
- [ ] Test webhook endpoints
- [ ] Verify billing integration

---

## Rollback Procedure

### Immediate Rollback
```bash
# Get deployment list
vercel ls

# Rollback to previous deployment
vercel rollback [deployment-url]
```

### Database Rollback
```sql
-- Keep rollback scripts for each migration
-- Example: rollback_v1.0.0_to_v0.9.0.sql
```

---

## Troubleshooting

### Common Issues

#### Build Failures
```bash
# Clear cache
vercel env pull
rm -rf .next node_modules
pnpm install
pnpm build
```

#### Environment Variable Issues
```bash
# Pull latest env vars
vercel env pull .env.local

# List all env vars
vercel env ls
```

#### Database Connection Issues
- Check Supabase connection pooling settings
- Verify service role key
- Check Row Level Security policies

#### Webhook Verification Failures
- Verify SHOPIFY_WEBHOOK_SECRET is set
- Check HMAC calculation
- Ensure raw body parsing

---

## Performance Optimization

### Vercel Configuration

#### vercel.json
```json
{
  "functions": {
    "app/api/webhooks/*.ts": {
      "maxDuration": 10
    }
  },
  "redirects": [
    {
      "source": "/",
      "has": [
        {
          "type": "query",
          "key": "shop"
        }
      ],
      "permanent": false,
      "destination": "/dashboard"
    }
  ]
}
```

### Edge Functions

Convert appropriate routes to Edge Runtime:
```typescript
export const runtime = 'edge';
```

### Caching Strategy

```typescript
// API Route caching
export const revalidate = 60; // Cache for 60 seconds

// Static page generation
export const dynamic = 'force-static';
```

---

## Security Hardening

### Headers Configuration

```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'X-Frame-Options',
    value: 'DENY'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block'
  }
];
```

### API Rate Limiting

```typescript
import { rateLimit } from '@/lib/rate-limit';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});
```

---

## Monitoring & Alerts

### Key Metrics to Monitor

1. **Application Metrics**
   - Response time (p50, p95, p99)
   - Error rate
   - Request volume

2. **Business Metrics**
   - New installations
   - Active users
   - Webhook processing time

3. **Infrastructure Metrics**
   - Memory usage
   - CPU utilization
   - Database connections

### Alert Configuration

```javascript
// Example alert thresholds
const alerts = {
  errorRate: {
    threshold: 0.01, // 1%
    duration: '5m'
  },
  responseTime: {
    threshold: 1000, // 1 second
    duration: '5m'
  },
  webhookFailure: {
    threshold: 5,
    duration: '10m'
  }
};
```

---

## Maintenance Mode

### Enable Maintenance
```bash
# Set environment variable
vercel env add MAINTENANCE_MODE production
# Value: true
```

### Maintenance Page
```typescript
// middleware.ts
if (process.env.MAINTENANCE_MODE === 'true') {
  return NextResponse.rewrite(new URL('/maintenance', request.url));
}
```

---

## Backup Strategy

### Database Backups
- Automated daily backups via Supabase
- Manual backup before major updates
```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

### Code Backups
- Git tags for each release
- GitHub repository as primary backup

---

## Support & Resources

- **Vercel Documentation**: https://vercel.com/docs
- **Next.js Deployment**: https://nextjs.org/docs/deployment
- **Shopify App Requirements**: https://shopify.dev/apps/store/requirements
- **Supabase Documentation**: https://supabase.com/docs