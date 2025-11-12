# Heartbeat Implementation Guide (6-Hour Check)

## Quick Overview

This guide shows how to implement a 6-hour heartbeat function in the Stock Alert app using an external scheduler + API endpoint approach.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ External Scheduler (Heroku Scheduler / AWS EventBridge)    │
│ - Runs every 6 hours                                        │
│ - Makes HTTP POST request with secret header                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ POST /api/internal/heartbeat
                       │ Headers: { 'x-heartbeat-secret': '...' }
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Next.js API Route: app/api/internal/heartbeat/route.ts     │
├─────────────────────────────────────────────────────────────┤
│ 1. Verify secret key                                        │
│ 2. Get list of active stores                                │
│ 3. For each store:                                          │
│    - Check webhook status                                   │
│    - Verify API access                                      │
│    - Check for stale data                                   │
│ 4. Log execution in heartbeat_logs table                    │
│ 5. Send optional notification (Slack/Email)                │
│ 6. Return status JSON                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ Supabase Database                                           │
├─────────────────────────────────────────────────────────────┤
│ heartbeat_logs table:                                       │
│ - id (UUID)                                                 │
│ - executed_at (TIMESTAMP)                                   │
│ - stores_checked (INT)                                      │
│ - issues_found (INT)                                        │
│ - webhook_status (TEXT)                                     │
│ - cleanup_performed (BOOLEAN)                               │
│ - status (success/warning/error)                            │
│ - details (JSONB)                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Create Heartbeat Utility Functions

File: `lib/heartbeat.ts`

```typescript
import { supabaseAdmin } from './supabase';
import axios from 'axios';
import { sendSlackNotification } from './notifications';

export interface HeartbeatResult {
  executed_at: Date;
  stores_checked: number;
  issues_found: number;
  webhook_status: string;
  cleanup_performed: boolean;
  status: 'success' | 'warning' | 'error';
  details: Record<string, any>;
}

/**
 * Performs health checks on all active stores
 */
export async function performHeartbeat(): Promise<HeartbeatResult> {
  const startTime = new Date();
  const details: Record<string, any> = {};
  let storesChecked = 0;
  let issuesFound = 0;

  try {
    // Fetch all active stores
    const { data: stores, error: storesError } = await supabaseAdmin
      .from('stores')
      .select('id, shop_domain, access_token, created_at')
      .eq('plan', 'free')
      .or('plan.eq.pro')
      .limit(100);

    if (storesError) {
      return {
        executed_at: startTime,
        stores_checked: 0,
        issues_found: 1,
        webhook_status: 'error',
        cleanup_performed: false,
        status: 'error',
        details: { error: storesError.message }
      };
    }

    storesChecked = stores?.length || 0;

    // Check each store
    const storeHealthResults: Record<string, any> = {};
    
    for (const store of stores || []) {
      const storeHealth = await checkStoreHealth(store);
      storeHealthResults[store.shop_domain] = storeHealth;
      
      if (!storeHealth.healthy) {
        issuesFound++;
      }
    }

    details.storeHealthChecks = storeHealthResults;

    // Perform cleanup of old records
    const cleanupResult = await performDataCleanup();
    details.cleanup = cleanupResult;

    // Check database connectivity
    const { data: dbTest } = await supabaseAdmin
      .from('heartbeat_logs')
      .select('count')
      .limit(1);

    details.databaseStatus = dbTest ? 'connected' : 'disconnected';

    // Log the heartbeat
    await logHeartbeat({
      executed_at: startTime,
      stores_checked: storesChecked,
      issues_found: issuesFound,
      webhook_status: 'ok',
      cleanup_performed: cleanupResult.performed,
      status: issuesFound > 0 ? 'warning' : 'success',
      details
    });

    // Send notification if issues found
    if (issuesFound > 0) {
      await notifyIssues({
        storesChecked,
        issuesFound,
        storeHealthResults
      });
    }

    return {
      executed_at: startTime,
      stores_checked: storesChecked,
      issues_found: issuesFound,
      webhook_status: 'ok',
      cleanup_performed: cleanupResult.performed,
      status: issuesFound > 0 ? 'warning' : 'success',
      details
    };

  } catch (error) {
    console.error('Heartbeat error:', error);
    
    return {
      executed_at: startTime,
      stores_checked: storesChecked,
      issues_found: 1,
      webhook_status: 'error',
      cleanup_performed: false,
      status: 'error',
      details: { 
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    };
  }
}

/**
 * Checks health of a single store
 */
async function checkStoreHealth(store: any): Promise<{
  healthy: boolean;
  webhooksActive: boolean;
  accessTokenValid: boolean;
  lastActivityTime: string | null;
  issues: string[];
}> {
  const issues: string[] = [];
  let webhooksActive = true;
  let accessTokenValid = true;

  try {
    // Check if store has recent webhook activity
    const { data: recentActivity } = await supabaseAdmin
      .from('inventory_tracking')
      .select('updated_at')
      .eq('store_id', store.id)
      .order('updated_at', { ascending: false })
      .limit(1);

    const lastActivityTime = recentActivity?.[0]?.updated_at || null;
    
    // Flag if no activity in 7 days
    if (lastActivityTime) {
      const lastActivityDate = new Date(lastActivityTime);
      const daysSinceActivity = Math.floor(
        (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceActivity > 7) {
        issues.push(`No webhook activity for ${daysSinceActivity} days`);
        webhooksActive = false;
      }
    } else {
      issues.push('No recorded activity ever');
      webhooksActive = false;
    }

    // Verify access token still works (simple check)
    try {
      const response = await axios.get(
        `https://${store.shop_domain}/admin/api/2024-01/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': store.access_token
          },
          timeout: 5000
        }
      );
      accessTokenValid = !!response.data;
    } catch (error) {
      issues.push('Access token validation failed');
      accessTokenValid = false;
    }

    return {
      healthy: issues.length === 0,
      webhooksActive,
      accessTokenValid,
      lastActivityTime,
      issues
    };

  } catch (error) {
    return {
      healthy: false,
      webhooksActive: false,
      accessTokenValid: false,
      lastActivityTime: null,
      issues: [error instanceof Error ? error.message : 'Unknown error']
    };
  }
}

/**
 * Cleans up old data (alert history > 90 days)
 */
async function performDataCleanup(): Promise<{
  performed: boolean;
  recordsDeleted: number;
}> {
  try {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: recordsToDelete } = await supabaseAdmin
      .from('alert_history')
      .select('id', { count: 'exact', head: true })
      .lt('created_at', ninetyDaysAgo.toISOString());

    if ((recordsToDelete?.length || 0) > 0) {
      await supabaseAdmin
        .from('alert_history')
        .delete()
        .lt('created_at', ninetyDaysAgo.toISOString());

      return {
        performed: true,
        recordsDeleted: recordsToDelete?.length || 0
      };
    }

    return {
      performed: false,
      recordsDeleted: 0
    };

  } catch (error) {
    console.error('Cleanup error:', error);
    return {
      performed: false,
      recordsDeleted: 0
    };
  }
}

/**
 * Logs heartbeat execution to database
 */
async function logHeartbeat(result: HeartbeatResult): Promise<void> {
  try {
    await supabaseAdmin
      .from('heartbeat_logs')
      .insert({
        executed_at: result.executed_at.toISOString(),
        stores_checked: result.stores_checked,
        issues_found: result.issues_found,
        webhook_status: result.webhook_status,
        cleanup_performed: result.cleanup_performed,
        status: result.status,
        details: result.details
      });
  } catch (error) {
    console.error('Failed to log heartbeat:', error);
  }
}

/**
 * Sends notification about issues
 */
async function notifyIssues(info: {
  storesChecked: number;
  issuesFound: number;
  storeHealthResults: Record<string, any>;
}): Promise<void> {
  try {
    const message = `
Heartbeat Alert
- Stores checked: ${info.storesChecked}
- Issues found: ${info.issuesFound}

Details:
${JSON.stringify(info.storeHealthResults, null, 2)}
    `.trim();

    // Send to Slack if webhook is configured
    const slackWebhook = process.env.ADMIN_SLACK_WEBHOOK;
    if (slackWebhook) {
      await axios.post(slackWebhook, {
        text: message,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Heartbeat Alert*\nStores: ${info.storesChecked}\nIssues: ${info.issuesFound}`
            }
          }
        ]
      });
    }
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}
```

---

### Step 2: Create API Endpoint

File: `app/api/internal/heartbeat/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { performHeartbeat } from '@/lib/heartbeat';

export async function POST(request: NextRequest) {
  try {
    // Verify secret key
    const secretHeader = request.headers.get('x-heartbeat-secret');
    const expectedSecret = process.env.HEARTBEAT_SECRET;

    if (!expectedSecret || secretHeader !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Perform heartbeat
    const result = await performHeartbeat();

    return NextResponse.json(
      {
        success: true,
        message: 'Heartbeat completed',
        result
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Heartbeat API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Allow GET for testing (in development)
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'GET not allowed in production' },
      { status: 405 }
    );
  }

  const secretHeader = request.headers.get('x-heartbeat-secret');
  const expectedSecret = process.env.HEARTBEAT_SECRET;

  if (!expectedSecret || secretHeader !== expectedSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const result = await performHeartbeat();

  return NextResponse.json({
    success: true,
    message: 'Heartbeat completed (test)',
    result
  });
}
```

---

### Step 3: Create Database Migration

File: `supabase/migrations/add_heartbeat_table.sql`

```sql
-- Create heartbeat_logs table
CREATE TABLE IF NOT EXISTS heartbeat_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  stores_checked INTEGER NOT NULL DEFAULT 0,
  issues_found INTEGER NOT NULL DEFAULT 0,
  webhook_status VARCHAR(50),
  cleanup_performed BOOLEAN DEFAULT false,
  status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'warning', 'error')),
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Create index for querying recent heartbeats
CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_executed_at 
ON heartbeat_logs(executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_heartbeat_logs_status 
ON heartbeat_logs(status, created_at DESC);

-- Add comment
COMMENT ON TABLE heartbeat_logs IS 'Logs of periodic heartbeat checks monitoring app health and store status';
```

---

### Step 4: Update Middleware

File: `middleware.ts` - Add to public paths:

```typescript
// ... existing code ...

export async function middleware(request: NextRequest) {
  // Skip authentication for public routes
  const publicPaths = [
    '/auth',
    '/auth-bounce',
    '/api/auth',
    '/api/webhooks',
    '/api/internal/heartbeat',  // ADD THIS LINE
    '/api/shopify/auth-test',
    '/api/shopify/verify-session',
    '/api/shopify/graphql',
    '/privacy',
    '/terms',
    '/favicon.ico'
  ];

  // ... rest of middleware code ...
}
```

---

### Step 5: Configure Environment Variables

File: `.env.local` - Add:

```bash
# Heartbeat Configuration
HEARTBEAT_SECRET=your-very-secure-random-secret-here-min-32-chars

# Optional: Admin notifications
ADMIN_SLACK_WEBHOOK=https://hooks.slack.com/services/TXXXXX/BXXXXX/your-webhook-token
```

Generate a secure secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### Step 6: Set Up External Scheduler

#### Option A: Heroku Scheduler

```bash
# Add Heroku Scheduler add-on
heroku addons:create scheduler:standard

# Create a scheduled job to run every 6 hours
# Command to run:
curl -X POST https://your-app.herokuapp.com/api/internal/heartbeat \
  -H "x-heartbeat-secret: $HEARTBEAT_SECRET"
```

#### Option B: AWS EventBridge

```json
{
  "Name": "StockAlertHeartbeat",
  "Description": "6-hour heartbeat check for Stock Alert app",
  "ScheduleExpression": "rate(6 hours)",
  "State": "ENABLED",
  "Target": {
    "Arn": "arn:aws:lambda:region:account:function:invoke-http",
    "HttpParameters": {
      "PathParameterValues": [],
      "HeaderParameters": {
        "x-heartbeat-secret": "YOUR_SECRET_HERE"
      },
      "QueryStringParameters": {}
    },
    "RoleArn": "arn:aws:iam::account:role/service-role/EventBridgeRole",
    "Url": "https://your-app.com/api/internal/heartbeat"
  }
}
```

#### Option C: Google Cloud Scheduler

```bash
gcloud scheduler jobs create http stock-alert-heartbeat \
  --schedule="0 */6 * * *" \
  --http-method=POST \
  --uri="https://your-app.com/api/internal/heartbeat" \
  --headers="x-heartbeat-secret=YOUR_SECRET_HERE" \
  --location=us-central1 \
  --time-zone="UTC"
```

---

## Testing the Heartbeat

### Test Locally (Development)

```bash
# Set secret in .env.local
HEARTBEAT_SECRET=test-secret-123

# Make request
curl -X GET http://localhost:3000/api/internal/heartbeat \
  -H "x-heartbeat-secret: test-secret-123"
```

### Test in Production

```bash
# Via curl
curl -X POST https://your-app.com/api/internal/heartbeat \
  -H "x-heartbeat-secret: $HEARTBEAT_SECRET" \
  -H "Content-Type: application/json"

# Response should be:
{
  "success": true,
  "message": "Heartbeat completed",
  "result": {
    "executed_at": "2024-11-12T21:30:00.000Z",
    "stores_checked": 5,
    "issues_found": 0,
    "webhook_status": "ok",
    "cleanup_performed": true,
    "status": "success",
    "details": { ... }
  }
}
```

---

## Monitoring

### View Heartbeat Logs

```sql
-- Most recent heartbeat
SELECT * FROM heartbeat_logs 
ORDER BY executed_at DESC 
LIMIT 1;

-- Heartbeats in last 7 days
SELECT * FROM heartbeat_logs 
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY executed_at DESC;

-- Count issues by status
SELECT 
  status, 
  COUNT(*) as count, 
  AVG(issues_found) as avg_issues
FROM heartbeat_logs 
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY status;

-- Stores with issues
SELECT DISTINCT
  (details -> 'storeHealthChecks')::jsonb as store_health
FROM heartbeat_logs 
WHERE issues_found > 0
ORDER BY executed_at DESC 
LIMIT 10;
```

---

## Troubleshooting

### Heartbeat not running?
1. Verify scheduler is configured correctly
2. Check logs: `heroku logs --tail` or cloud provider logs
3. Test endpoint manually with curl
4. Verify HEARTBEAT_SECRET environment variable is set

### Getting 401 Unauthorized?
1. Check secret key matches between scheduler and .env
2. Verify header name is exactly `x-heartbeat-secret`
3. Ensure secret is not empty or whitespace

### Database connection errors?
1. Check Supabase credentials in .env
2. Verify SUPABASE_SERVICE_ROLE_KEY is correct
3. Check database is not down: `supabase status`

### High number of issues?
1. Check store access tokens are still valid
2. Verify webhooks are registered with Shopify
3. Check email/Slack notification settings
4. Review store_settings for disabled notifications

---

## Files Created/Modified Summary

```
NEW FILES:
- lib/heartbeat.ts (heartbeat logic)
- app/api/internal/heartbeat/route.ts (API endpoint)
- supabase/migrations/add_heartbeat_table.sql (database schema)

MODIFIED FILES:
- middleware.ts (add public path)
- .env.local (add HEARTBEAT_SECRET)

DOCUMENTATION:
- docs/architecture/heartbeat-implementation-guide.md (this file)
```

---

## Next Steps

1. Generate secure secret: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Create the three new files above
3. Update middleware.ts and .env.local
4. Apply database migration in Supabase
5. Test endpoint locally
6. Deploy to production
7. Set up external scheduler (Heroku/AWS/GCP)
8. Monitor heartbeat_logs table for execution

---

## Reference Links

- Next.js API Routes: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- Supabase: https://supabase.com/docs
- Heroku Scheduler: https://devcenter.heroku.com/articles/scheduler
- AWS EventBridge: https://docs.aws.amazon.com/eventbridge/
- Google Cloud Scheduler: https://cloud.google.com/scheduler/docs

