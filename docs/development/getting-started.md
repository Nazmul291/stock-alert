# Getting Started - Development Guide

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v20.0.0 or higher)
- **pnpm** (v8.0.0 or higher)
- **Git**
- **Shopify Partner Account**
- **Supabase Account**
- **ngrok** (for local development)

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/stock-alert.git
cd stock-alert
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Environment Setup

Create `.env.local` file:

```bash
cp .env.example .env.local
```

Configure your environment variables:

```env
# Shopify Configuration
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory
SHOPIFY_APP_URL=https://your-ngrok-url.ngrok.io
SHOPIFY_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/api/webhooks

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Email Configuration (Zoho Mail)
EMAIL_HOST=smtp.zoho.com
EMAIL_PORT=587
EMAIL_USER=your-email@domain.com
EMAIL_PASS=your-email-password

# JWT Secret
JWT_SECRET=generate-a-secure-random-string

# Development Settings
NODE_ENV=development
NEXT_PUBLIC_HOST=https://your-ngrok-url.ngrok.io
NEXT_PUBLIC_SHOPIFY_API_KEY=your_api_key_here
```

### 4. Database Setup

#### Create Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create new project
3. Copy connection details

#### Run Database Migrations

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

Or manually run the SQL from `supabase/schema.sql` in Supabase SQL Editor.

### 5. Shopify App Setup

#### Create Development App

1. Go to [Shopify Partners](https://partners.shopify.com)
2. Create new app
3. Set app URL: `https://your-ngrok-url.ngrok.io`
4. Set redirect URLs:
   - `https://your-ngrok-url.ngrok.io/api/auth/callback`
   - `https://your-ngrok-url.ngrok.io/auth/callback`

#### Configure Webhooks

In your app settings, configure required webhooks:
- INVENTORY_LEVELS/UPDATE
- PRODUCTS/UPDATE
- PRODUCTS/DELETE
- APP/UNINSTALLED

### 6. Start Development Server

```bash
# Terminal 1: Start ngrok
ngrok http 3000

# Terminal 2: Start Next.js dev server
pnpm dev
```

Your app will be available at `http://localhost:3000`

---

## Project Structure

```
stock-alert/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── billing/      # Billing endpoints
│   │   ├── products/     # Product management
│   │   └── webhooks/     # Webhook handlers
│   ├── (pages)/          # App pages
│   │   ├── dashboard/    # Main dashboard
│   │   ├── products/     # Product management
│   │   ├── settings/     # Settings page
│   │   └── billing/      # Billing page
│   └── layout.tsx        # Root layout
├── components/            # React components
│   ├── ui/              # UI components
│   ├── forms/           # Form components
│   └── providers/       # Context providers
├── lib/                  # Utility functions
│   ├── shopify.ts       # Shopify API client
│   ├── supabase.ts      # Supabase client
│   └── notifications.ts # Notification logic
├── store/               # Redux store
│   ├── slices/         # Redux slices
│   └── index.ts        # Store configuration
├── public/             # Static assets
├── styles/             # Global styles
├── types/              # TypeScript types
└── docs/               # Documentation
```

---

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes
# ...

# Run tests
pnpm test

# Run linting
pnpm lint

# Commit changes
git add .
git commit -m "feat: add new feature"

# Push branch
git push origin feature/your-feature-name
```

### 2. Code Style

We use ESLint and Prettier for code formatting:

```bash
# Format code
pnpm format

# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix
```

### 3. Type Checking

```bash
# Run TypeScript compiler
pnpm type-check

# Watch mode
pnpm type-check:watch
```

---

## Testing

### Unit Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Integration Tests

```bash
# Run integration tests
pnpm test:integration

# Test specific endpoint
pnpm test:integration -- --grep "products"
```

### E2E Tests

```bash
# Run E2E tests
pnpm test:e2e

# Run E2E tests in headed mode
pnpm test:e2e:headed
```

---

## Debugging

### Debug Next.js

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "port": 9229,
      "env": {
        "NODE_OPTIONS": "--inspect"
      }
    }
  ]
}
```

### Debug API Routes

Add debugger statements:
```typescript
export async function POST(request: Request) {
  debugger; // Breakpoint here
  const body = await request.json();
  // ...
}
```

### Debug Webhooks

Use ngrok inspector:
1. Open `http://localhost:4040`
2. View all webhook requests
3. Replay failed webhooks

---

## Common Development Tasks

### Adding a New API Route

```typescript
// app/api/your-route/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Your logic here
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Your logic here
  return NextResponse.json({ success: true });
}
```

### Adding a New Page

```typescript
// app/your-page/page.tsx
export default function YourPage() {
  return (
    <div>
      <h1>Your Page</h1>
    </div>
  );
}
```

### Adding Database Migration

```sql
-- supabase/migrations/001_your_migration.sql
ALTER TABLE stores ADD COLUMN new_field VARCHAR(255);
```

Run migration:
```bash
supabase db push
```

### Testing Webhooks Locally

```bash
# Send test webhook
curl -X POST http://localhost:3000/api/webhooks/inventory \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Topic: INVENTORY_LEVELS/UPDATE" \
  -H "X-Shopify-Shop-Domain: test-store.myshopify.com" \
  -d '{
    "inventory_item_id": 123456,
    "location_id": 789012,
    "available": 10
  }'
```

---

## Performance Optimization

### 1. Bundle Analysis

```bash
# Analyze bundle size
pnpm analyze
```

### 2. Lighthouse Testing

```bash
# Run Lighthouse CI
pnpm lighthouse
```

### 3. Database Query Optimization

```typescript
// Use indexes for frequent queries
const { data } = await supabase
  .from('inventory_tracking')
  .select('*')
  .eq('store_id', storeId)
  .order('updated_at', { ascending: false })
  .limit(50);
```

---

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

#### Database Connection Issues
- Check Supabase service is running
- Verify environment variables
- Check network connectivity

#### Webhook Verification Failures
- Ensure SHOPIFY_WEBHOOK_SECRET is set
- Verify ngrok URL matches Shopify settings
- Check HMAC calculation logic

#### Build Errors
```bash
# Clear cache and rebuild
rm -rf .next node_modules
pnpm install
pnpm build
```

---

## Development Tools

### Recommended VS Code Extensions

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense
- Shopify Liquid
- Thunder Client (API testing)
- GitLens

### Useful Scripts

```json
// package.json scripts
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "format": "prettier --write .",
  "test": "jest",
  "db:migrate": "supabase db push",
  "db:reset": "supabase db reset",
  "ngrok": "ngrok http 3000"
}
```

---

## Resources

### Documentation
- [Next.js Documentation](https://nextjs.org/docs)
- [Shopify App Development](https://shopify.dev/apps)
- [Supabase Documentation](https://supabase.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Community
- [Shopify Community Forums](https://community.shopify.com/)
- [Next.js Discord](https://nextjs.org/discord)
- [Supabase Discord](https://discord.supabase.com/)

### Learning Resources
- [Shopify App Development Course](https://shopify.dev/apps/getting-started)
- [Next.js Tutorial](https://nextjs.org/learn)
- [TypeScript Tutorial](https://www.typescriptlang.org/docs/handbook/intro.html)